import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { FactEntry, FactsState, Job, Prompts } from '../shared/api.js';
import { TOPICS, TOPIC_NAMES } from '../shared/factTopics.js';
import { rows } from './db.js';
import { applyChanges, diff, entries, sameDoc } from './factsOps.js';
import * as repo from './factsRepo.js';
import { cancel, currentJob, isBusy, startGate, startImpact } from './jobs.js';
import { factsProd, factsStg } from './pools.js';
import prompts from './prompts.generated.json' with { type: 'json' };

const who = (req: FastifyRequest) => String(req.headers['tailscale-user-login'] ?? (process.env.CONSOLE_DEV === '1' ? 'dev@local' : 'unknown'));
const fail = (status: number, message: string) => Object.assign(new Error(message), { statusCode: status, expose: true });

async function state(): Promise<FactsState> {
  const [prod, stg, draft, history, wf] = await Promise.all([
    repo.getByStatus(factsProd, 'live'), repo.getByStatus(factsStg, 'live'), repo.getByStatus(factsStg, 'draft'), repo.recent(factsProd, 20),
    rows<{ n: string }>('select count(*) as n from stats_enquiry_detail where facts_version is not null'),
  ]);
  const src = draft ?? stg;
  const dv = draft && stg ? diff(stg.doc, draft.doc) : [];
  const marks = new Map(dv.map(d => [d.path, d]));
  const list: FactEntry[] = src ? entries(src.doc).map(e => {
    const m = marks.get(e.path);
    return { ...e, changed: m ? (m.kind === 'added' ? 'added' : 'changed') : null, ...(m?.kind === 'changed' ? { before: m.before as string | number | boolean } : {}) };
  }) : [];
  return {
    production: prod ? repo.info(prod) : null, staging: stg ? repo.info(stg) : null, draft: draft ? repo.info(draft) : null,
    workflowReadsDatabase: Number(wf[0]?.n ?? 0) > 0,
    entries: list, entriesFrom: draft ? 'draft' : 'staging', diffVsStaging: dv,
    diffStagingVsProduction: prod && stg ? diff(prod.doc, stg.doc) : [],
    canPublish: repo.publishGuard(stg, prod),
    history: history.map(repo.info),
    topics: TOPICS.map(id => ({ id, name: TOPIC_NAMES[id] })),
  };
}

const change = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), path: z.string().max(200), value: z.union([z.string().max(600), z.number(), z.boolean()]) }),
  z.object({ op: z.literal('remove'), path: z.string().max(200) }),
  z.object({ op: z.literal('addItem'), path: z.string().max(200), value: z.union([z.string().max(600), z.record(z.string(), z.unknown())]) }),
  z.object({ op: z.literal('removeItem'), path: z.string().max(200) }),
]);
const note = z.string().trim().max(300).optional();

export async function factsRoutes(app: FastifyInstance) {
  const writable = (req: FastifyRequest) => { if (process.env.CONSOLE_READONLY === '1') throw fail(403, 'The console is in read-only mode.'); void req; };
  const idle = () => { if (isBusy()) throw fail(409, 'A test is running on staging. Wait for it to finish, or cancel it.'); };

  app.get('/api/prompts', async (): Promise<Prompts> => prompts as Prompts);
  app.get('/api/facts', async () => state());

  app.post('/api/facts/draft', async req => {
    writable(req); idle();
    const body = z.object({ changes: z.array(change).min(1).max(50), note }).parse(req.body);
    const [stg, cur] = await Promise.all([repo.getByStatus(factsStg, 'live'), repo.getByStatus(factsStg, 'draft')]);
    if (!stg) throw fail(409, 'Staging has no live fact set to edit.');
    const r = applyChanges((cur ?? stg).doc, body.changes);
    if ('error' in r) throw fail(400, r.error);
    if (sameDoc(r.doc, stg.doc)) { await repo.discardDraft(factsStg); return state(); }       // edited back to the staging set: no draft needed
    await repo.saveDraft(factsStg, r.doc, body.note ?? cur?.note ?? null, who(req));
    return state();
  });

  app.delete('/api/facts/draft', async req => { writable(req); idle(); await repo.discardDraft(factsStg); return state(); });

  app.post('/api/facts/draft/apply', async req => {
    writable(req); idle();
    await repo.applyDraft(factsStg, who(req)).catch(e => { throw fail(409, e.message); });
    return state();
  });

  app.post('/api/facts/publish', async req => {
    writable(req); idle();
    const body = z.object({ confirm: z.literal(true), note }).parse(req.body);
    const [stg, prod] = await Promise.all([repo.getByStatus(factsStg, 'live'), repo.getByStatus(factsProd, 'live')]);
    const guard = repo.publishGuard(stg, prod);
    if (!guard.ok) throw fail(409, guard.reason);
    await repo.publish(factsProd, stg!.doc, stg!.version, body.note ?? `Published from staging v${stg!.version} (${stg!.gate_run})`, who(req));
    return state();
  });

  app.post('/api/facts/restore', async req => {
    writable(req); idle();
    const body = z.object({ version: z.number().int().positive(), confirm: z.literal(true) }).parse(req.body);
    const [prod, old] = await Promise.all([repo.getByStatus(factsProd, 'live'), repo.getVersion(factsProd, body.version)]);
    if (!old || old.status === 'draft') throw fail(404, 'No such version.');
    if (prod && old.version === prod.version) throw fail(409, 'That version is already live.');
    await repo.publish(factsProd, old.doc, null, `Restored production v${old.version}`, who(req));
    return state();
  });

  app.get('/api/jobs/current', async (): Promise<Job | null> => currentJob());

  app.post('/api/jobs/gate', async (req): Promise<Job> => {
    writable(req);
    const stg = await repo.getByStatus(factsStg, 'live');
    if (!stg) throw fail(409, 'Staging has no live fact set.');
    return startGate(who(req), stg.version);
  });

  app.post('/api/jobs/impact', async (req): Promise<Job> => {
    writable(req);
    if (process.env.CONSOLE_ALLOW_RECHECK === '0') throw fail(403, 'Re-checks are switched off.');
    const body = z.object({ topic: z.enum(TOPICS).optional(), limit: z.number().int().min(1).max(30).default(14), ids: z.array(z.string().uuid()).min(1).max(30).optional() }).parse(req.body ?? {});
    const stg = await repo.getByStatus(factsStg, 'live');
    return startImpact(who(req), body, stg?.version ?? null);
  });

  app.post('/api/jobs/cancel', async req => { writable(req); return { cancelled: cancel() }; });
}

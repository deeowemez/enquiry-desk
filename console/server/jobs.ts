import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '../shared/api.js';
import { topicLabel } from '../shared/labels.js';
import { rows } from './db.js';
import * as repo from './factsRepo.js';
import { factsStg, recheckRead, stagingRead } from './pools.js';

// One job at a time: both kinds use the staging workflow, and two at once would mix their rows and their cost.
const REPO = path.resolve(process.env.CONSOLE_REPO_ROOT ?? process.cwd());
const WEBHOOK = process.env.CONSOLE_STAGING_WEBHOOK ?? 'http://n8n:5678/webhook/enquiry-staging';
const STAGING_PSQL = process.env.CONSOLE_STAGING_PSQL ?? 'psql -h postgres -U console_staging -d enquiry_staging';
const PYTHON = process.env.CONSOLE_PYTHON ?? 'python3';

let current: Job | null = null;
let child: ChildProcess | null = null;
let cancelled = false;

export const currentJob = () => current;
export const isBusy = () => current?.status === 'running';

function begin(kind: Job['kind'], label: string, by: string, total: number, factsVersion: number | null): Job {
  if (isBusy()) throw Object.assign(new Error('Another test is already running. Wait for it to finish, or cancel it.'), { statusCode: 409, expose: true });
  cancelled = false;
  current = { id: randomUUID(), kind, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, startedBy: by, label, progress: { done: 0, total }, factsVersion, message: null };
  return current;
}
function finish(job: Job, status: Job['status'], message: string | null) { job.status = status; job.message = message; job.finishedAt = new Date().toISOString(); child = null; }

export function cancel(): boolean {
  if (!isBusy()) return false;
  cancelled = true; child?.kill('SIGTERM'); return true;
}

function run(cmd: string, args: string[], onLine: (l: string) => void, env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; out: string }> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env } });
    child = p; let out = '', buf = '';
    const feed = (d: Buffer) => { const s = d.toString(); out += s; buf += s; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => resolve({ code: -1, out: out + String(e) }));
    p.on('close', code => resolve({ code, out }));
  });
}

/** The PASS/FAIL lines of `compare.py --check`. */
export const parseChecks = (out: string) => [...out.matchAll(/^\s+(PASS|FAIL)\s+(.+?)\s{2,}(.*)$/gm)].map(x => ({ pass: x[1] === 'PASS', name: x[2]!.trim(), detail: x[3]!.trim() }));

const caseCount = () => { try { return readFileSync(path.join(REPO, 'test/enquiries.jsonl'), 'utf8').split('\n').filter(Boolean).length; } catch { return 24; } };

/** The 24-case test on staging, exactly as test/score.py and test/compare.py --check do it from the command line. */
export function startGate(by: string, factsVersion: number): Job {
  const job = begin('gate', `Facts v${factsVersion} on staging`, by, caseCount(), factsVersion);
  void (async () => {
    try {
      const env = { PGPASSWORD: process.env.CONSOLE_STAGING_PASSWORD ?? '' };
      const score = await run(PYTHON, ['test/score.py', '--webhook', WEBHOOK, '--psql', STAGING_PSQL, '--label', `console: staging facts v${factsVersion}`],
        l => { if (/^t\d{2}\s/.test(l)) job.progress.done += 1; }, env);
      if (cancelled) return finish(job, 'cancelled', 'Cancelled.');
      const m = /Full results: .*?([0-9]{8}-[0-9]{6})\.jsonl/.exec(score.out);
      if (!m) return finish(job, 'failed', `The scorer did not produce a result. ${score.out.trim().split('\n').slice(-2).join(' ').slice(0, 200)}`);
      const run_ = m[1]!;
      const cmp = await run(PYTHON, ['test/compare.py', '--check', run_], () => {}, env);
      const checks = parseChecks(cmp.out);
      // No checks printed means compare.py could not evaluate the run (e.g. a missing baseline file): that is NOT a failed gate,
      // so say so and record nothing against the facts.
      if (!checks.length) return finish(job, 'failed', `The gate could not be evaluated: ${cmp.out.trim().split('\n').slice(-2).join(' ').slice(0, 240) || 'compare.py printed nothing'}`);
      const passed = cmp.code === 0 && checks.every(c => c.pass);
      job.gate = { run: run_, passed, checks };
      // Record the result on the staging set that was tested, but only if staging still serves that version.
      const live = await repo.getByStatus(factsStg, 'live');
      if (live && live.version === factsVersion) { await repo.recordGate(factsStg, factsVersion, run_, passed); finish(job, 'done', passed ? 'Passed the gate.' : 'Did not pass the gate.'); }
      else finish(job, 'done', 'The staging facts changed during the run, so the result was not recorded against any version.');
    } catch (e) { finish(job, 'failed', (e as Error).message); }
  })();
  return job;
}

const OUTCOMES = ['auto_send', 'clarify', 'escalate', 'blocked', 'failed'];
const tally = (xs: string[]) => Object.fromEntries(OUTCOMES.map(o => [o, xs.filter(x => x === o).length]));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Re-send past enquiries to STAGING (which serves the candidate facts) and compare the outcome with what happened originally.
 * Each goes out under a test+recheck address, so it is flagged is_test: no Gmail draft, no Telegram, not counted as real traffic.
 * The enquiry text is read with a narrow login and re-sent by the server; it is never returned to the browser.
 */
export function startImpact(by: string, opts: { ids?: string[]; topic?: string; limit: number }, factsVersion: number | null): Job {
  const job = begin('impact', opts.ids?.length === 1 ? 'Re-check one enquiry on staging' : `Re-check ${opts.topic ? topicLabel(opts.topic) : 'recent'} enquiries on staging`, by, 0, factsVersion);
  void (async () => {
    try {
      const orig = opts.ids
        ? await rows<{ id: string; category: string | null; outcome: string }>(
            `select id, category, case when status = 'failed' then 'failed' else action end as outcome from stats_enquiry_detail where id = any($1::uuid[]) and status = 'processed'`, [opts.ids])
        : await rows<{ id: string; category: string | null; outcome: string }>(
            `select id, category, action as outcome from stats_enquiry_detail where status = 'processed' and action is not null and ($1::text is null or category = $1) order by received_at desc limit $2`, [opts.topic ?? null, opts.limit]);
      job.progress.total = orig.length;
      const batch = Date.now().toString(36);
      const before: string[] = [], after: string[] = [], changed: NonNullable<Job['impact']>['changed'] = [];
      for (const [i, o] of orig.entries()) {
        if (cancelled) return finish(job, 'cancelled', 'Cancelled.');
        const src = (await recheckRead.query<{ subject: string | null; body: string }>('select subject, body from enquiry where id = $1', [o.id])).rows[0];
        if (!src) { job.progress.done += 1; continue; }
        const email = `test+recheck-${batch}-${i}@example.com`;
        const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, subject: src.subject ?? '', message: src.body }) });
        let outcome = 'failed';
        if (res.status < 300) {
          for (let t = 0; t < 60; t++) {
            const r = (await stagingRead.query<{ status: string; action: string | null }>('select status, action from enquiry where from_email = $1', [email])).rows[0];
            if (r && (r.status === 'processed' || r.status === 'failed')) { outcome = r.status === 'failed' ? 'failed' : (r.action ?? 'failed'); break; }
            await sleep(2000);
          }
        }
        before.push(o.outcome); after.push(outcome);
        if (o.outcome !== outcome) changed.push({ ref: o.id.slice(0, 8), topic: topicLabel(o.category), before: o.outcome, after: outcome });
        job.progress.done += 1;
        await sleep(1500);
      }
      job.impact = { before: tally(before), after: tally(after), changed, total: orig.length };
      finish(job, 'done', `${changed.length} of ${orig.length} changed outcome.`);
    } catch (e) { finish(job, 'failed', (e as Error).message); }
  })();
  return job;
}

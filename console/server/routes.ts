import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Blocked, Cost, EnquiryDetail, EnquiryPage, Health, Outcome, Overview, Stage } from '../shared/api.js';
import { blockLabel, reasonFor, STAGE_LABEL, topicLabel } from '../shared/labels.js';
import { rows } from './db.js';
import { BASE_WHERE, OUTCOME_SQL, rangeQuery } from './filters.js';
import { type DetailRecord, ROW_COLS, toRow } from './map.js';

const REVIEW_BASE = process.env.REVIEW_BASE_URL ?? '';

/** Every day in the range as YYYY-MM-DD, oldest first, in Hong Kong time (the customers' day). */
async function daysIn(days: number): Promise<string[]> {
  const r = await rows<{ day: string }>(
    `select to_char(d::date, 'YYYY-MM-DD') as day
       from generate_series((now() at time zone 'Asia/Hong_Kong')::date - ($1::int - 1), (now() at time zone 'Asia/Hong_Kong')::date, interval '1 day') d`, [days]);
  return r.map(x => x.day);
}

export async function routes(app: FastifyInstance) {
  app.get('/api/overview', async (req): Promise<Overview> => {
    const { days, traffic } = rangeQuery.parse(req.query);
    const W = BASE_WHERE('$1', traffic);
    const [[tiles], [health], daily, reasons, waiting, dayList] = await Promise.all([
      rows<{ pending: string; oldest: string | null; safety: string; processed: string; cleared: string; blocked: string; failed: string; total_cost: string; avg_cost: string }>(
        `select count(*) filter (where d.review_status = 'pending') as pending,
                max(extract(epoch from now() - d.received_at) / 3600) filter (where d.review_status = 'pending') as oldest,
                count(*) filter (where d.review_status = 'pending' and cardinality(array(select jsonb_array_elements_text(d.safety_flags))) > 0) as safety,
                count(*) filter (where d.status = 'processed') as processed,
                count(*) filter (where d.status = 'processed' and d.action in ('auto_send', 'clarify')) as cleared,
                count(*) filter (where d.status = 'processed' and d.action = 'blocked') as blocked,
                count(*) filter (where d.status = 'failed') as failed,
                coalesce(sum(d.cost_usd), 0) as total_cost,
                coalesce(avg(d.cost_usd) filter (where d.status = 'processed'), 0) as avg_cost
           from stats_enquiry_detail d where ${W}`, [days]),
      rows<{ dead_letter: string; stuck: string; failures_24h: string; last_processed_at: Date | null }>(`select * from stats_health`),
      rows<{ day: string; outcome: Outcome; n: string }>(
        `select to_char(d.day, 'YYYY-MM-DD') as day, ${OUTCOME_SQL} as outcome, count(*) as n
           from stats_enquiry_detail d where ${W} group by 1, 2`, [days]),
      rows<{ kind: string; problems: string }>(
        `select p.kind, count(*) as problems from stats_block_problem p join stats_enquiry_detail d on d.id = p.enquiry_id
          where ${W} group by 1 order by 2 desc`, [days]),
      rows<DetailRecord>(
        `select ${ROW_COLS} from stats_enquiry_detail d where ${W} and d.review_status = 'pending' order by d.received_at limit 3`, [days]),
      daysIn(days),
    ]);
    const t = tiles!, h = health!;
    const map = new Map<string, Overview['daily'][number]>(dayList.map(day => [day, { day, auto_send: 0, clarify: 0, escalate: 0, blocked: 0, failed: 0 }]));
    for (const r of daily) {
      const row = map.get(r.day);
      if (row && r.outcome in row) (row as unknown as Record<string, number>)[r.outcome] = Number(r.n);
    }
    const processed = Number(t.processed);
    return {
      needsPerson: { count: Number(t.pending), oldestHours: t.oldest == null ? null : Number(t.oldest), safety: Number(t.safety) },
      cleared: { pct: processed ? Math.round((100 * Number(t.cleared)) / processed) : 0, count: Number(t.cleared), of: processed },
      blockedOrFailed: { total: Number(t.blocked) + Number(t.failed), blocked: Number(t.blocked), failed: Number(t.failed) },
      health: { deadLetter: Number(h.dead_letter), stuck: Number(h.stuck), failures24h: Number(h.failures_24h), lastProcessedAt: h.last_processed_at?.toISOString() ?? null },
      cost: { avgUsd: Number(t.avg_cost), totalUsd: Number(t.total_cost) },
      daily: [...map.values()],
      blockReasons: reasons.map(r => ({ kind: r.kind, label: blockLabel(r.kind), problems: Number(r.problems) })),
      oldestWaiting: waiting.map(toRow),
    };
  });

  const listQuery = rangeQuery.extend({
    outcome: z.enum(['auto_send', 'clarify', 'escalate', 'blocked', 'failed', 'in_progress']).optional(),
    topic: z.string().max(60).optional(),
    review: z.enum(['pending', 'approved', 'taken_over']).optional(),
    flagged: z.enum(['1']).optional(),
    q: z.string().max(40).regex(/^[0-9a-f-]*$/i).optional(),       // a reference: hex prefix of the id
    kind: z.string().max(80).optional(),                             // a block-reason bucket
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  });

  async function list(q: z.infer<typeof listQuery>, extra: string[] = [], order = 'd.received_at desc'): Promise<EnquiryPage> {
    const params: unknown[] = [q.days];
    const conds = [BASE_WHERE('$1', q.traffic), ...extra];
    const add = (sql: string, v: unknown) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
    if (q.outcome) add(`(${OUTCOME_SQL}) = ?`, q.outcome);
    if (q.topic) add('d.category = ?', q.topic);
    if (q.review) add('d.review_status = ?', q.review);
    if (q.flagged) conds.push(`jsonb_array_length(d.safety_flags) > 0`);
    if (q.q) add(`d.id::text like ? || '%'`, q.q.toLowerCase());
    if (q.kind) add('d.id in (select enquiry_id from stats_block_problem where kind = ?)', q.kind);
    const where = conds.join(' and ');
    const [{ n } = { n: '0' }] = await rows<{ n: string }>(`select count(*) as n from stats_enquiry_detail d where ${where}`, params);
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const data = await rows<DetailRecord>(
      `select ${ROW_COLS} from stats_enquiry_detail d where ${where} order by ${order} limit $${params.length - 1} offset $${params.length}`, params);
    return { rows: data.map(toRow), total: Number(n), page: q.page, pageSize: q.pageSize };
  }

  app.get('/api/queue', async req => {
    const q = listQuery.parse({ pageSize: 50, ...(req.query as object) });
    return list(q, [`d.review_status = 'pending'`], 'd.received_at asc');
  });
  app.get('/api/enquiries', async req => list(listQuery.parse(req.query)));

  app.get('/api/enquiries/:id', async (req, reply): Promise<EnquiryDetail | undefined> => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [d] = await rows<DetailRecord & { review_token: string | null; has_draft: boolean; sent: boolean }>(
      `select ${ROW_COLS}, d.review_token, d.has_draft, d.sent from stats_enquiry_detail d where d.id = $1`, [id]);
    if (!d) { reply.code(404).send({ error: 'Not found' }); return; }
    const stages = await rows<{ stage: string; status: string; attempt: number; model: string | null; cost_usd: string | null; duration_ms: number | null; error_kind: string | null }>(
      `select stage, status, attempt, model, cost_usd, duration_ms, error_kind from stats_run_stage where enquiry_id = $1
         order by array_position(array['intake','normalise','classify','clarify','draft','verify','validate','review'], stage), at`, [id]);
    const failed = stages.find(s => s.status === 'failed' && s.stage !== 'validate');
    const row = toRow({ ...d, failed_stage: failed?.stage, error_kind: failed?.error_kind });
    return {
      row, language: d.language, confidence: d.confidence == null ? null : Number(d.confidence),
      missingSlots: d.missing_slots ?? [], blockKinds: d.block_kinds ?? [], hasDraft: d.has_draft, sent: d.sent,
      stages: stages.map((s): Stage => ({ stage: s.stage, status: s.status, attempt: s.attempt, model: s.model, costUsd: Number(s.cost_usd ?? 0), durationMs: s.duration_ms, errorKind: s.error_kind })),
      reviewUrl: d.review_token && REVIEW_BASE ? `${REVIEW_BASE}?id=${d.id}&t=${d.review_token}` : null,
    };
  });

  app.get('/api/blocked', async (req): Promise<Blocked> => {
    const { days, traffic } = rangeQuery.parse(req.query);
    const W = BASE_WHERE('$1', traffic);
    const [reasons, [share], perDay, byTopic, dayList] = await Promise.all([
      rows<{ kind: string; problems: string; replies: string }>(
        `select p.kind, count(*) as problems, count(distinct p.enquiry_id) as replies
           from stats_block_problem p join stats_enquiry_detail d on d.id = p.enquiry_id where ${W} group by 1 order by 2 desc`, [days]),
      rows<{ blocked: string; processed: string }>(
        `select count(*) filter (where d.action = 'blocked') as blocked, count(*) filter (where d.status = 'processed') as processed
           from stats_enquiry_detail d where ${W}`, [days]),
      rows<{ day: string; n: string }>(
        `select to_char(d.day, 'YYYY-MM-DD') as day, count(*) as n from stats_enquiry_detail d where ${W} and d.action = 'blocked' group by 1`, [days]),
      rows<{ category: string | null; n: string }>(
        `select d.category, count(distinct p.enquiry_id) as n from stats_block_problem p join stats_enquiry_detail d on d.id = p.enquiry_id
          where ${W} and p.kind = 'gate 2: facts can''t answer' group by 1 order by 2 desc limit 8`, [days]),
      daysIn(days),
    ]);
    const m = new Map(perDay.map(r => [r.day, Number(r.n)]));
    const s = share!;
    return {
      reasons: reasons.map(r => ({ kind: r.kind, label: blockLabel(r.kind), problems: Number(r.problems), replies: Number(r.replies) })),
      share: { pct: Number(s.processed) ? Math.round((100 * Number(s.blocked)) / Number(s.processed)) : 0, blocked: Number(s.blocked), of: Number(s.processed) },
      perDay: dayList.map(day => ({ day, blocked: m.get(day) ?? 0 })),
      unansweredByTopic: byTopic.map(r => ({ topic: topicLabel(r.category), count: Number(r.n) })),
    };
  });

  app.get('/api/blocked/:kind', async (req): Promise<EnquiryPage> => {
    const { kind } = z.object({ kind: z.string().max(80) }).parse(req.params);
    return list(listQuery.parse({ pageSize: 20, ...(req.query as object), kind }));
  });

  app.get('/api/cost', async (req): Promise<Cost> => {
    const { days, traffic } = rangeQuery.parse(req.query);
    const W = BASE_WHERE('$1', traffic);
    const [[tot], perDay, stages, dayList] = await Promise.all([
      rows<{ total: string; avg: string; calls: string }>(
        `select coalesce(sum(d.cost_usd), 0) as total, coalesce(avg(d.cost_usd) filter (where d.status = 'processed'), 0) as avg, coalesce(sum(d.model_calls), 0) as calls
           from stats_enquiry_detail d where ${W}`, [days]),
      rows<{ day: string; c: string }>(
        `select to_char(d.day, 'YYYY-MM-DD') as day, sum(d.cost_usd) as c from stats_enquiry_detail d where ${W} group by 1`, [days]),
      rows<{ stage: string; model: string; calls: string; c: string }>(
        `select s.stage, s.model, count(*) as calls, coalesce(sum(s.cost_usd), 0) as c
           from stats_run_stage s join stats_enquiry_detail d on d.id = s.enquiry_id
          where ${W} and s.model is not null group by 1, 2 order by 4 desc`, [days]),
      daysIn(days),
    ]);
    const t = tot!, sum = stages.reduce((a, r) => a + Number(r.c), 0) || 1;
    const m = new Map(perDay.map(r => [r.day, Number(r.c)]));
    return {
      totalUsd: Number(t.total), avgUsd: Number(t.avg), modelCalls: Number(t.calls),
      perDay: dayList.map(day => ({ day, costUsd: m.get(day) ?? 0 })),
      stages: stages.map(r => ({ stage: r.stage, model: r.model.replace(/^(global|apac)\.amazon\./, '').replace(/-v1:0$/, ''), calls: Number(r.calls), costUsd: Number(r.c), sharePct: Math.round((100 * Number(r.c)) / sum) })),
    };
  });

  app.get('/api/health', async (): Promise<Health> => {
    const [[h], fails] = await Promise.all([
      rows<{ dead_letter: string; stuck: string; failures_24h: string; last_processed_at: Date | null }>(`select * from stats_health`),
      rows<{ id: string; at: Date; stage: string; error_kind: string | null; status: string }>(
        `select s.enquiry_id as id, s.at, s.stage, s.error_kind, d.status
           from stats_run_stage s join stats_enquiry_detail d on d.id = s.enquiry_id
          where s.status = 'failed' and s.stage <> 'validate' order by s.at desc limit 10`),
    ]);
    const x = h!;
    return {
      deadLetter: Number(x.dead_letter), stuck: Number(x.stuck), failures24h: Number(x.failures_24h), lastProcessedAt: x.last_processed_at?.toISOString() ?? null,
      recentFailures: fails.map(f => ({ ref: f.id.slice(0, 8), at: f.at.toISOString(), stage: STAGE_LABEL[f.stage] ?? f.stage, cause: f.error_kind ?? 'unknown', status: f.status === 'failed' ? 'open' : 'replayed' })),
    };
  });
}

export { reasonFor };

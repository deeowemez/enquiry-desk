import type pg from 'pg';
import type { FactSetInfo } from '../shared/api.js';
import { sameDoc } from './factsOps.js';

export interface SetRow {
  version: number; status: 'draft' | 'live' | 'archived'; doc: unknown; note: string | null; created_by: string | null; created_at: Date;
  based_on: number | null; source_version: number | null; gate_run: string | null; gate_passed: boolean | null; published_at: Date | null; published_by: string | null;
}

export const info = (r: SetRow): FactSetInfo => ({
  version: r.version, status: r.status, note: r.note, createdBy: r.created_by, createdAt: r.created_at.toISOString(), basedOn: r.based_on,
  sourceVersion: r.source_version, gateRun: r.gate_run, gatePassed: r.gate_passed, publishedAt: r.published_at?.toISOString() ?? null, publishedBy: r.published_by,
});

const COLS = 'version, status, doc, note, created_by, created_at, based_on, source_version, gate_run, gate_passed, published_at, published_by';

export async function getByStatus(pool: pg.Pool, status: SetRow['status']): Promise<SetRow | null> {
  return (await pool.query<SetRow>(`select ${COLS} from fact_set where status = $1`, [status])).rows[0] ?? null;
}
export async function recent(pool: pg.Pool, limit = 20): Promise<SetRow[]> {
  return (await pool.query<SetRow>(`select ${COLS} from fact_set where status in ('live','archived') order by version desc limit $1`, [limit])).rows;
}
export async function getVersion(pool: pg.Pool, version: number): Promise<SetRow | null> {
  return (await pool.query<SetRow>(`select ${COLS} from fact_set where version = $1`, [version])).rows[0] ?? null;
}

async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}

/** Create the draft (from the live set) or replace the existing draft's document. */
export async function saveDraft(pool: pg.Pool, doc: unknown, note: string | null, by: string): Promise<SetRow> {
  return tx(pool, async c => {
    const live = (await c.query<SetRow>(`select ${COLS} from fact_set where status = 'live' for update`)).rows[0];
    if (!live) throw new Error('There is no live fact set to start a draft from.');
    const cur = (await c.query<SetRow>(`select ${COLS} from fact_set where status = 'draft' for update`)).rows[0];
    const json = JSON.stringify(doc);
    if (cur) return (await c.query<SetRow>(`update fact_set set doc = $1::json, note = $2, created_by = $3, created_at = now() where version = $4 returning ${COLS}`, [json, note, by, cur.version])).rows[0]!;
    return (await c.query<SetRow>(`insert into fact_set (status, doc, note, created_by, based_on) values ('draft', $1::json, $2, $3, $4) returning ${COLS}`, [json, note, by, live.version])).rows[0]!;
  });
}

// Never a DELETE (the console login has no such right): a thrown-away draft is marked, so history is only ever added to.
export async function discardDraft(pool: pg.Pool): Promise<void> { await pool.query(`update fact_set set status = 'discarded' where status = 'draft'`); }

/** Staging: the draft becomes the live set (what the staging workflow reads); the old live set is archived. Its test result starts empty. */
export async function applyDraft(pool: pg.Pool, by: string): Promise<SetRow> {
  return tx(pool, async c => {
    const d = (await c.query<SetRow>(`select ${COLS} from fact_set where status = 'draft' for update`)).rows[0];
    if (!d) throw new Error('There is no draft to apply.');
    await c.query(`update fact_set set status = 'archived' where status = 'live'`);
    return (await c.query<SetRow>(`update fact_set set status = 'live', published_at = now(), published_by = $2, gate_run = null, gate_passed = null where version = $1 returning ${COLS}`, [d.version, by])).rows[0]!;
  });
}

export async function recordGate(pool: pg.Pool, version: number, run: string, passed: boolean): Promise<void> {
  await pool.query(`update fact_set set gate_run = $2, gate_passed = $3 where version = $1 and status = 'live'`, [version, run, passed]);
}

/** Production: copy a document in as the new live set (the previous one is archived, so it can be restored). */
export async function publish(pool: pg.Pool, doc: unknown, sourceVersion: number | null, note: string | null, by: string): Promise<SetRow> {
  return tx(pool, async c => {
    await c.query(`update fact_set set status = 'archived' where status = 'live'`);
    return (await c.query<SetRow>(
      `insert into fact_set (status, doc, note, created_by, source_version, published_at, published_by) values ('live', $1::json, $2, $3, $4, now(), $3) returning ${COLS}`,
      [JSON.stringify(doc), note, by, sourceVersion])).rows[0]!;
  });
}

/** The one rule for publishing, kept pure so it is tested without a database. */
export function publishGuard(staging: SetRow | null, production: SetRow | null): { ok: boolean; reason: string } {
  if (!staging) return { ok: false, reason: 'Staging has no live fact set.' };
  if (!production) return { ok: false, reason: 'Production has no live fact set to compare with.' };
  if (sameDoc(staging.doc, production.doc)) return { ok: false, reason: 'Production already has these facts: nothing to publish.' };
  if (!staging.gate_run) return { ok: false, reason: 'These facts have not been tested yet. Run the 24-case test first.' };
  if (staging.gate_passed !== true) return { ok: false, reason: `The test run ${staging.gate_run} did not pass the gate, so these facts cannot be published.` };
  return { ok: true, reason: `Passed the gate in run ${staging.gate_run}.` };
}

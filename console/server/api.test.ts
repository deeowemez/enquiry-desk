// Integration tests against the real database (the read-only console_ro login). Run: npm test
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { pool } from './db.js';

let dev: FastifyInstance, strict: FastifyInstance;
before(async () => { dev = await buildApp({ dev: true, logger: false }); strict = await buildApp({ dev: false, logger: false }); });
after(async () => { await dev.close(); await strict.close(); await pool.end(); });

const get = async (app: FastifyInstance, url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers });

describe('sign-in', () => {
  it('rejects API calls that did not come through Tailscale Serve', async () => assert.equal((await get(strict, '/api/overview')).statusCode, 401));
  it('accepts them with the tailnet identity header', async () => assert.equal((await get(strict, '/api/overview', { 'tailscale-user-login': 'a@b.c' })).statusCode, 200));
  it('serves the health check without sign-in', async () => assert.equal((await get(strict, '/healthz')).statusCode, 200));
});

describe('input validation', () => {
  for (const url of ['/api/overview?days=0', '/api/overview?days=9999', '/api/overview?traffic=evil', '/api/enquiries?q=zz!', "/api/enquiries?outcome=x'; drop table enquiry;--",
    '/api/enquiries?page=0', '/api/enquiries?pageSize=500', '/api/enquiries/not-a-uuid'])
    it(`400 for ${url}`, async () => assert.equal((await get(dev, url)).statusCode, 400));
  it('404 for an unknown enquiry', async () => assert.equal((await get(dev, '/api/enquiries/00000000-0000-4000-8000-000000000000')).statusCode, 404));
  it('treats a hostile reason as data, not SQL', async () => {
    const r = await get(dev, `/api/blocked/${encodeURIComponent("x'; drop table enquiry;--")}`);
    assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).total, 0);
  });
});

describe('what leaves the API', () => {
  const FORBIDDEN = ['from_email', 'subject', 'body', 'email', 'message', 'review_token', 'reply_body', 'draft_reply'];
  const urls = ['/api/overview', '/api/queue', '/api/enquiries?pageSize=50', '/api/blocked', '/api/cost', '/api/health'];
  for (const url of urls)
    it(`${url} has no customer-text fields and no review token`, async () => {
      const body = (await get(dev, url)).body;
      for (const k of FORBIDDEN) assert.ok(!body.includes(`"${k}"`), `${url} exposes "${k}"`);
      assert.ok(!/[?&]t=[0-9a-f]{20,}/i.test(body), `${url} leaks a review token`);
    });
  it('the review link appears only on an enquiry detail, as reviewUrl', async () => {
    const list = JSON.parse((await get(dev, '/api/enquiries?outcome=blocked&pageSize=1')).body);
    const detail = await get(dev, `/api/enquiries/${list.rows[0].id}`);
    const d = JSON.parse(detail.body);
    assert.match(d.reviewUrl ?? '', /\/webhook\/review\?id=[0-9a-f-]{36}&t=[0-9a-f]+/);
    assert.ok(!('review_token' in d));
  });
  it('responses carry security headers', async () => {
    const r = await get(dev, '/api/overview');
    assert.equal(r.headers['referrer-policy'], 'no-referrer'); assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.equal(r.headers['cache-control'], 'no-store');
  });
});

describe('numbers add up', () => {
  it('the daily series has one entry per day and outcomes sum to the processed total', async () => {
    const o = JSON.parse((await get(dev, '/api/overview?days=14&traffic=both')).body);
    assert.equal(o.daily.length, 14);
    const sum = o.daily.reduce((a: number, d: Record<string, number>) => a + (d.auto_send ?? 0) + (d.clarify ?? 0) + (d.escalate ?? 0) + (d.blocked ?? 0), 0);
    assert.ok(sum >= o.cleared.of, 'daily outcomes should cover every processed enquiry');
  });
  it('the real/test split is exhaustive', async () => {
    const n = async (t: string) => JSON.parse((await get(dev, `/api/enquiries?days=90&traffic=${t}`)).body).total as number;
    assert.equal((await n('real')) + (await n('test')), await n('both'));
  });
  it('the console login cannot read raw tables', async () => {
    await assert.rejects(pool.query('select 1 from enquiry limit 1'), /permission denied/);
    await assert.rejects(pool.query('select 1 from reply limit 1'), /permission denied/);
  });
});

describe('facts and prompts (read side)', () => {
  it('shows the four prompts, each with text and a model', async () => {
    const p = JSON.parse((await get(dev, '/api/prompts')).body);
    assert.deepEqual(p.stages.map((s: { stage: string }) => s.stage), ['classify', 'draft', 'verify', 'clarify']);
    for (const s of p.stages) { assert.ok(s.text.length > 100); assert.ok(s.model); }
  });
  it('returns the fact state: production and staging live sets, entries with topics', async () => {
    const f = JSON.parse((await get(dev, '/api/facts')).body);
    assert.equal(f.production.status, 'live'); assert.equal(f.staging.status, 'live');
    assert.ok(f.entries.length > 50); assert.ok(f.entries.some((e: { path: string; topics: string[] }) => e.path === 'pricing.dropin_single_lesson' && e.topics.includes('pricing')));
    assert.equal(typeof f.workflowReadsDatabase, 'boolean'); assert.equal(typeof f.canPublish.ok, 'boolean');
  });
});

describe('facts and jobs (write side: staging only, never publishes)', () => {
  const post = (url: string, body: unknown, headers: Record<string, string> = { 'x-console': '1' }) => dev.inject({ method: 'POST', url, headers: { 'content-type': 'application/json', ...headers }, payload: JSON.stringify(body) });
  it('refuses a write without the x-console header', async () => assert.equal((await post('/api/facts/draft', { changes: [{ op: 'set', path: 'pricing.dropin_single_lesson', value: 1 }] }, {})).statusCode, 403));
  it('refuses DELETE without the header', async () => assert.equal((await dev.inject({ method: 'DELETE', url: '/api/facts/draft' })).statusCode, 403));
  it('rejects a bad change with a plain-language error', async () => {
    const r = await post('/api/facts/draft', { changes: [{ op: 'set', path: 'pricing.dropin_single_lesson', value: 'free' }] });
    assert.equal(r.statusCode, 400); assert.match(JSON.parse(r.body).error, /dropin_single_lesson/);
  });
  it('rejects a path that reaches for the prototype', async () => assert.equal((await post('/api/facts/draft', { changes: [{ op: 'set', path: '__proto__.x', value: 'y' }] })).statusCode, 400));
  it('rejects an empty or oversized change list', async () => {
    assert.equal((await post('/api/facts/draft', { changes: [] })).statusCode, 400);
    assert.equal((await post('/api/facts/draft', { changes: Array(51).fill({ op: 'remove', path: 'pricing.currency' }) })).statusCode, 400);
  });
  it('publish and restore need an explicit confirm', async () => {
    assert.equal((await post('/api/facts/publish', {})).statusCode, 400);
    assert.equal((await post('/api/facts/restore', { version: 1 })).statusCode, 400);
  });
  it('rejects a bad re-check request', async () => {
    assert.equal((await post('/api/jobs/impact', { topic: 'not_a_topic' })).statusCode, 400);
    assert.equal((await post('/api/jobs/impact', { ids: ['nope'] })).statusCode, 400);
    assert.equal((await post('/api/jobs/impact', { limit: 500 })).statusCode, 400);
  });
  it('a draft can be made, shows its diff, and can be discarded (history is only added to)', async () => {
    const before = JSON.parse((await get(dev, '/api/facts')).body);
    const cur = before.entries.find((e: { path: string }) => e.path === 'pricing.dropin_single_lesson').value as number;
    const made = JSON.parse((await post('/api/facts/draft', { changes: [{ op: 'set', path: 'pricing.dropin_single_lesson', value: cur + 1 }], note: 'test' })).body);
    try {
      assert.equal(made.entriesFrom, 'draft');
      assert.deepEqual(made.diffVsStaging.map((d: { path: string }) => d.path), ['pricing.dropin_single_lesson']);
      assert.ok(made.entries.find((e: { path: string; changed: string | null }) => e.path === 'pricing.dropin_single_lesson').changed);
    } finally {
      const gone = JSON.parse((await dev.inject({ method: 'DELETE', url: '/api/facts/draft', headers: { 'x-console': '1' } })).body);
      assert.equal(gone.draft, null);
    }
  });
  it('read-only mode turns every write off', async () => {
    process.env.CONSOLE_READONLY = '1';
    try {
      for (const [url, body] of [['/api/facts/draft', { changes: [{ op: 'remove', path: 'pricing.currency' }] }], ['/api/facts/draft/apply', {}], ['/api/facts/publish', { confirm: true }], ['/api/jobs/gate', {}], ['/api/jobs/impact', {}]] as const)
        assert.equal((await post(url, body)).statusCode, 403, url);
      assert.equal((await get(dev, '/api/facts')).statusCode, 200);          // reading still works
    } finally { delete process.env.CONSOLE_READONLY; }
  });
  it('the console writes only to fact_set: its facts login cannot touch enquiries or delete history', async () => {
    const { factsStg } = await import('./pools.js');
    await assert.rejects(factsStg.query('select 1 from enquiry limit 1'), /permission denied/);
    await assert.rejects(factsStg.query('delete from fact_set where version = -1'), /permission denied/);
    await assert.rejects(factsStg.query('update enquiry set category = category'), /permission denied/);
  });
});

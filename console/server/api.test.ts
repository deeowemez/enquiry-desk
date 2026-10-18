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

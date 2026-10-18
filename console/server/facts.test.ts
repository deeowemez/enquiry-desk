// Unit tests for the fact-table logic: no database needed. Run: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { validateDoc } from '../shared/factsSchema.js';
import { sectionTopics, topicsFor, TOPICS } from '../shared/factTopics.js';
import { applyChange, applyChanges, diff, entries, parsePath, sameDoc, type Change } from './factsOps.js';

const wf = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../workflows/01-intake.mine.json'), 'utf8'));
const code = (name: string): string => wf.nodes.find((n: { name: string }) => n.name === name).parameters.jsCode;
// The seed document production started from (kb/facts.json; the workflow now loads the facts from the database).
const seed = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../kb/facts.json'), 'utf8'));

describe('the schema', () => {
  it('accepts the real fact table (the one the workflow ships)', () => { const r = validateDoc(seed); assert.ok(r.success, JSON.stringify((r as any).error?.issues)); });
  it('rejects a price that is not a number', () => assert.ok(!validateDoc({ ...seed, pricing: { ...seed.pricing, dropin_single_lesson: '25' } }).success));
  it('rejects a time that is not HH:MM', () => assert.ok(!validateDoc({ ...seed, support_hours: { ...seed.support_hours, open_utc: '9am' } }).success));
  it('rejects an unknown top-level section (no topic would ever see it)', () => assert.ok(!validateDoc({ ...seed, extras: { a: 'b' } }).success));
  it('rejects a missing required section', () => { const { pricing, ...rest } = seed; assert.ok(!validateDoc(rest).success); });
  it('rejects a deadline without a verified flag', () => assert.ok(!validateDoc({ ...seed, deadlines: [{ name: 'x', date: '2026-10-15', time_uk: '18:00' }] }).success));
});

describe('topics', () => {
  // Parse `select facts` and compare: which sections each topic is given.
  const body = code('select facts');
  const sectionsPerTopic = new Map<string, Set<string>>();
  for (const m of body.matchAll(/^\s{2}(\w+):\s+f => \(\{([\s\S]*?)\}\)/gm)) {
    const set = new Set<string>();
    for (const r of m[2]!.matchAll(/\bf\.(\w+)(\.trial)?/g)) set.add(r[2] ? 'pricing.trial' : r[1]!);
    sectionsPerTopic.set(m[1]!, set);
  }
  it('the workflow still has the six topics this mapping knows', () => assert.deepEqual([...sectionsPerTopic.keys()].sort(), [...TOPICS].sort()));
  for (const topic of TOPICS)
    it(`"${topic}" sees the same sections as the workflow's select facts`, () => {
      const mine = new Set<string>();
      for (const [section, topics] of Object.entries(sectionTopics)) if (topics.includes(topic)) mine.add(section);
      if (topicsFor('pricing.trial.price').includes(topic)) mine.add('pricing.trial');
      const theirs = sectionsPerTopic.get(topic)!;
      // pricing itself implies pricing.trial for the pricing topic
      const norm = (s: Set<string>) => [...s].filter(x => !(x === 'pricing.trial' && s.has('pricing'))).sort();
      assert.deepEqual(norm(mine), norm(theirs));
    });
  it('policies are not shown to any topic today', () => assert.deepEqual(topicsFor('policies.guarantees'), []));
});

describe('paths', () => {
  it('parses dots and indexes', () => assert.deepEqual(parsePath('pricing.trial.includes[1]'), ['pricing', 'trial', 'includes', 1]));
  for (const bad of ['__proto__.x', 'constructor.prototype.polluted', 'a..b', 'pricing.', '', 'a[b]', 'pricing.trial["x"]', 'x'.repeat(300)])
    it(`rejects ${JSON.stringify(bad.slice(0, 30))}`, () => assert.throws(() => parsePath(bad)));
  it('cannot pollute the prototype', () => {
    assert.throws(() => applyChange(seed, { op: 'set', path: '__proto__.polluted', value: 'x' }));
    assert.equal(({} as any).polluted, undefined);
  });
});

describe('edits', () => {
  const set = (p: string, v: string | number | boolean): Change => ({ op: 'set', path: p, value: v });
  it('changes a price', () => { const r = applyChanges(seed, [set('pricing.dropin_single_lesson', 30)]); assert.ok('doc' in r && r.doc.pricing.dropin_single_lesson === 30); });
  it('does not change the input', () => { const before = JSON.stringify(seed); applyChanges(seed, [set('pricing.dropin_single_lesson', 30)]); assert.equal(JSON.stringify(seed), before); });
  it('adds a new fact inside an existing section', () => { const r = applyChanges(seed, [set('lesson_schedule.timezone_note', 'Lesson times are in Hong Kong time.')]); assert.ok('doc' in r); assert.ok(topicsFor('lesson_schedule.timezone_note').includes('scheduling')); });
  it('keeps the key order the model sees', () => { const r = applyChanges(seed, [set('pricing.dropin_single_lesson', 30)]); assert.ok('doc' in r); assert.deepEqual(Object.keys(r.doc.pricing), Object.keys(seed.pricing)); });
  it('rejects a price as text', () => assert.ok('error' in applyChanges(seed, [set('pricing.dropin_single_lesson', 'thirty')])));
  it('rejects a new top-level section', () => assert.ok('error' in applyChanges(seed, [set('newsection.x', 'y')])));
  it('rejects removing a required fact', () => assert.ok('error' in applyChanges(seed, [{ op: 'remove', path: 'pricing.currency' }])));
  it('rejects setting a whole group to a value', () => assert.ok('error' in applyChanges(seed, [set('pricing.trial', 'free')])));
  it('adds and removes a deadline', () => {
    const add = applyChanges(seed, [{ op: 'addItem', path: 'deadlines', value: { name: 'Test deadline', date: '2027-02-01', time_uk: '12:00', verified: false } }]);
    assert.ok('doc' in add && add.doc.deadlines.length === seed.deadlines.length + 1);
    const rm = applyChanges(add.doc, [{ op: 'removeItem', path: `deadlines[${seed.deadlines.length}]` }]);
    assert.ok('doc' in rm && sameDoc(rm.doc, seed));
  });
  it('rejects a deadline with a bad date', () => assert.ok('error' in applyChanges(seed, [{ op: 'addItem', path: 'deadlines', value: { name: 'x', date: 'soon', time_uk: '12:00', verified: true } }])));
  it('rejects a list item that does not exist', () => assert.ok('error' in applyChanges(seed, [{ op: 'removeItem', path: 'deadlines[99]' }])));
});

describe('reading a document', () => {
  it('lists every value with its topics', () => {
    const e = entries(seed); const price = e.find(x => x.path === 'pricing.subscription_per_subject_per_month')!;
    assert.equal(price.value, 95); assert.equal(price.type, 'number'); assert.deepEqual(price.topics, ['pricing']);
    assert.ok(e.some(x => x.path === 'subjects[5].available' && x.value === false));
    assert.ok(e.some(x => x.path === 'pricing.trial.includes[0]'));
  });
  it('diffs added, changed and removed', () => {
    const r = applyChanges(seed, [{ op: 'set', path: 'pricing.dropin_single_lesson', value: 30 }, { op: 'set', path: 'lesson_schedule.timezone_note', value: 'x' }, { op: 'removeItem', path: 'deadlines[1]' }]);
    assert.ok('doc' in r);
    const d = diff(seed, r.doc);
    assert.ok(d.some(x => x.kind === 'changed' && x.path === 'pricing.dropin_single_lesson' && x.before === 25 && x.after === 30));
    assert.ok(d.some(x => x.kind === 'added' && x.path === 'lesson_schedule.timezone_note'));
    assert.ok(d.some(x => x.kind === 'removed' && x.path.startsWith('deadlines[1]')));
    assert.deepEqual(diff(seed, seed), []);
  });
});

// ---- the publish rule (pure: no database)
import { publishGuard, type SetRow } from './factsRepo.js';
const row = (over: Partial<SetRow> = {}): SetRow => ({ version: 1, status: 'live', doc: seed, note: null, created_by: 't', created_at: new Date(), based_on: null, source_version: null, gate_run: null, gate_passed: null, published_at: null, published_by: null, ...over });
const edited = (() => { const r = applyChanges(seed, [{ op: 'set', path: 'pricing.dropin_single_lesson', value: 30 }]); if (!('doc' in r)) throw new Error('setup'); return r.doc; })();

describe('publishing is guarded', () => {
  it('refuses when staging has nothing', () => assert.equal(publishGuard(null, row()).ok, false));
  it('refuses when production has nothing to compare with', () => assert.equal(publishGuard(row({ doc: edited, gate_run: 'r', gate_passed: true }), null).ok, false));
  it('refuses identical facts', () => assert.match(publishGuard(row({ gate_run: 'r', gate_passed: true }), row()).reason, /nothing to publish/));
  it('refuses untested facts', () => assert.match(publishGuard(row({ doc: edited }), row()).reason, /not been tested/));
  it('refuses facts that failed the gate', () => { const g = publishGuard(row({ doc: edited, gate_run: 'run1', gate_passed: false }), row()); assert.equal(g.ok, false); assert.match(g.reason, /did not pass/); });
  it('refuses a result that is neither passed nor failed', () => assert.equal(publishGuard(row({ doc: edited, gate_run: 'run1', gate_passed: null }), row()).ok, false));
  it('allows tested, passed, different facts', () => assert.equal(publishGuard(row({ doc: edited, gate_run: 'run1', gate_passed: true }), row()).ok, true));
});

import { parseChecks } from './jobs.js';
describe('reading compare.py --check output', () => {
  const real = `Run 20261018-160317 (staging, facts from the database (v1)) vs baseline 20261017-082124 (baseline nova-2-lite x4, per-stage config, corrected prices #1)
  PASS  safety flags           6/6
  PASS  invented claims        0 of 8 replies
  FAIL  failed / missing       2
  PASS  category accuracy      22/24 (baseline 22/24, tolerance 1)
  => 1 GATE(S) FAILED`;
  it('finds every check with its result and detail', () => {
    const c = parseChecks(real);
    assert.equal(c.length, 4); assert.deepEqual(c[0], { pass: true, name: 'safety flags', detail: '6/6' });
    assert.equal(c[2]!.pass, false); assert.equal(c[3]!.detail, '22/24 (baseline 22/24, tolerance 1)');
  });
  it('finds nothing in an error message, so a broken comparison is never read as a failed gate', () => assert.deepEqual(parseChecks('No results file for run 20261017-082124.'), []));
});

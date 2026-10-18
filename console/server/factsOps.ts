import { type FactsDoc, SECTIONS, validateDoc } from '../shared/factsSchema.js';
import { topicsFor } from '../shared/factTopics.js';

export type Change =
  | { op: 'set'; path: string; value: string | number | boolean }       // change a value, or add a new scalar fact to an existing object
  | { op: 'remove'; path: string }                                      // remove a key (new facts only matter: required ones fail validation)
  | { op: 'addItem'; path: string; value: Record<string, unknown> | string }   // append to a list (a deadline, a subject, an inclusion...)
  | { op: 'removeItem'; path: string };                                 // path ends in [index]

type Seg = string | number;
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,60}$/;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** "pricing.trial.includes[1]" -> ['pricing','trial','includes',1]. Anything else is rejected, so a path can never reach the prototype. */
export function parsePath(path: string): Seg[] {
  if (path.length > 200) throw new Error('path too long');
  const segs: Seg[] = [];
  for (const part of path.split('.')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d{1,4}\])*)$/.exec(part);
    if (!m || !KEY.test(m[1]!) || FORBIDDEN.has(m[1]!)) throw new Error(`bad path segment "${part}"`);
    segs.push(m[1]!);
    for (const idx of m[2]!.matchAll(/\[(\d+)\]/g)) segs.push(Number(idx[1]));
  }
  if (!segs.length) throw new Error('empty path');
  return segs;
}

function parentOf(doc: unknown, segs: Seg[]): { parent: any; last: Seg } {
  let cur: any = doc;
  for (const s of segs.slice(0, -1)) {
    if (cur == null || typeof cur !== 'object' || !Object.hasOwn(cur, s)) throw new Error('that part of the fact table does not exist');
    cur = cur[s];
  }
  return { parent: cur, last: segs[segs.length - 1]! };
}

export function applyChange(input: unknown, c: Change): unknown {
  const doc = structuredClone(input) as any;
  const segs = parsePath(c.path);
  if (!SECTIONS.includes(String(segs[0]))) throw new Error(`"${segs[0]}" is not a section of the fact table`);
  const { parent, last } = parentOf(doc, segs);
  if (parent == null || typeof parent !== 'object') throw new Error('cannot edit inside a value');
  switch (c.op) {
    case 'set':
      if (Array.isArray(parent) !== (typeof last === 'number')) throw new Error('path does not match the structure');
      if (Array.isArray(parent) && Number(last) >= parent.length) throw new Error('no such list item');
      if (Object.hasOwn(parent, last) && typeof parent[last] === 'object' && parent[last] !== null) throw new Error('that is a group, not a single value');
      parent[last] = c.value; break;
    case 'remove':
      if (Array.isArray(parent) || !Object.hasOwn(parent, last)) throw new Error('no such fact');
      delete parent[last]; break;
    case 'addItem': {
      const list = parent[last];
      if (!Array.isArray(list)) throw new Error('that is not a list');
      list.push(c.value); break;
    }
    case 'removeItem':
      if (!Array.isArray(parent) || typeof last !== 'number' || last >= parent.length) throw new Error('no such list item');
      parent.splice(last, 1); break;
  }
  return doc;
}

export function applyChanges(doc: unknown, changes: Change[]): { doc: FactsDoc } | { error: string } {
  let cur = doc;
  try { for (const c of changes) cur = applyChange(cur, c); } catch (e) { return { error: (e as Error).message }; }
  const v = validateDoc(cur);
  if (!v.success) return { error: v.error.issues.slice(0, 4).map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  // Keep the author's key order (the order the model sees the facts in): the validated copy is only a check.
  return { doc: cur as FactsDoc };
}

// ---- reading a document as a list of facts

export interface Entry { path: string; section: string; group: string; label: string; value: string | number | boolean; type: 'text' | 'number' | 'boolean'; topics: string[] }

const humanise = (s: string) => s.replace(/_/g, ' ');
const SCALAR = (v: unknown): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v);

export function entries(doc: unknown): Entry[] {
  const out: Entry[] = [];
  const walk = (v: unknown, path: string, section: string, group: string) => {
    if (SCALAR(v)) {
      const last = path.slice(path.lastIndexOf('.') + 1);
      out.push({ path, section, group, label: humanise(last.replace(/\[\d+\]$/, (m) => ` ${Number(m.slice(1, -1)) + 1}`)), value: v, type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'text', topics: topicsFor(path) });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => {
        const g = x && typeof x === 'object' ? String((x as any).name ?? (x as any).id ?? (x as any).subject ?? `item ${i + 1}`) : group;
        walk(x, `${path}[${i}]`, section, x && typeof x === 'object' ? `${section.replace(/_/g, ' ')} · ${g}` : group);
      });
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, section || k, group || humanise(path ? path.split('.')[0]! : k));
    }
  };
  for (const [k, v] of Object.entries((doc ?? {}) as Record<string, unknown>)) walk(v, k, k, humanise(k));
  return out;
}

export interface Diff { path: string; kind: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown }

export function diff(before: unknown, after: unknown): Diff[] {
  const a = new Map(entries(before).map(e => [e.path, e.value])), b = new Map(entries(after).map(e => [e.path, e.value]));
  const out: Diff[] = [];
  for (const [p, v] of b) { if (!a.has(p)) out.push({ path: p, kind: 'added', after: v }); else if (a.get(p) !== v) out.push({ path: p, kind: 'changed', before: a.get(p), after: v }); }
  for (const [p, v] of a) if (!b.has(p)) out.push({ path: p, kind: 'removed', before: v });
  return out;
}

export const sameDoc = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

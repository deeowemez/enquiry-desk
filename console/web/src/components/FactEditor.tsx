import { useState } from 'react';
import type { FactChange, FactEntry, FactsState } from '../../../shared/api';
import { sectionTopics } from '../../../shared/factTopics';
import { useSend } from '../api';
import { Dialog } from '../ui';

const PARENTS = ['company', 'support_hours', 'booking', 'pricing', 'pricing.trial', 'lesson_schedule', 'policies'];

/** Edit one fact, or add one. Changes go to the DRAFT (on staging); nothing a customer sees changes until it is tested and published. */
export function FactEditor({ target, onClose }: { target: FactEntry | 'new'; onClose: () => void }) {
  const save = useSend<FactsState, { changes: FactChange[]; note?: string }>('POST', '/api/facts/draft');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'fact' | 'deadline'>('fact');
  const isNew = target === 'new';
  const e = isNew ? null : target;
  const [value, setValue] = useState<string>(e ? String(e.value) : '');
  const [parent, setParent] = useState('lesson_schedule');
  const [key, setKey] = useState('');
  const [dl, setDl] = useState({ name: '', date: '', time_uk: '18:00', verified: false });
  const [err, setErr] = useState('');

  const submit = (changes: FactChange[]) => save.mutate({ changes, note: note || undefined }, { onSuccess: onClose, onError: er => setErr(er.message) });
  const typed = (): string | number | boolean => e?.type === 'number' ? Number(value) : e?.type === 'boolean' ? value === 'true' : value;
  const itemRoot = e ? /^(.*?\[\d+\])(\.|$)/.exec(e.path)?.[1] ?? null : null;
  const topics = e ? e.topics : sectionTopics[parent.split('.')[0]!] ?? [];

  return (
    <Dialog title={isNew ? 'Add a fact' : 'Edit a fact'} kind="drawer" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center' }}><div><div style={{ fontSize: 17, fontWeight: 650 }}>{isNew ? 'Add a fact' : e!.label}</div>{e && <div className="ref">{e.path}</div>}</div><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="callout">Changes are saved to a <b>draft</b> on staging. Nothing customers see changes until you apply it, test it and publish it.</div>

      {isNew && <div className="tabs"><button className={mode === 'fact' ? 'on' : ''} onClick={() => setMode('fact')}>A fact</button><button className={mode === 'deadline' ? 'on' : ''} onClick={() => setMode('deadline')}>A deadline</button></div>}

      {!isNew && <label className="field"><span>What the system may say</span>
        {e!.type === 'boolean' ? <select className="f" value={value} onChange={ev => setValue(ev.target.value)}><option value="true">Yes (true)</option><option value="false">No (false)</option></select>
          : e!.type === 'number' ? <input className="f" type="number" step="any" value={value} onChange={ev => setValue(ev.target.value)} />
          : String(value).length > 80 ? <textarea className="f" value={value} onChange={ev => setValue(ev.target.value)} /> : <input className="f" value={value} onChange={ev => setValue(ev.target.value)} />}
      </label>}

      {isNew && mode === 'fact' && <>
        <label className="field"><span>Where it belongs</span><select className="f" value={parent} onChange={ev => setParent(ev.target.value)}>{PARENTS.map(p => <option key={p} value={p}>{p.replace(/[._]/g, ' ')}</option>)}</select></label>
        <label className="field"><span>Name (letters, numbers, underscores)</span><input className="f" value={key} onChange={ev => setKey(ev.target.value.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40))} placeholder="timezone_note" /></label>
        <label className="field"><span>What the system may say</span><textarea className="f" value={value} onChange={ev => setValue(ev.target.value)} /></label>
      </>}
      {isNew && mode === 'deadline' && <>
        <label className="field"><span>Name</span><input className="f" value={dl.name} onChange={ev => setDl({ ...dl, name: ev.target.value })} /></label>
        <label className="field"><span>Date</span><input className="f" type="date" value={dl.date} onChange={ev => setDl({ ...dl, date: ev.target.value })} /></label>
        <label className="field"><span>Time (UK)</span><input className="f" type="time" value={dl.time_uk} onChange={ev => setDl({ ...dl, time_uk: ev.target.value })} /></label>
        <label className="chip"><input type="checkbox" checked={dl.verified} onChange={ev => setDl({ ...dl, verified: ev.target.checked })} /> Verified (unverified deadlines are never stated to customers)</label>
      </>}

      <div className="kv"><dt>Used for</dt><dd>{topics.length ? topics.map(t => t.replace(/_/g, ' ')).join(', ') : <span className="mut">no topic: reference only</span>}</dd></div>
      <label className="field"><span>Why this change (optional, kept in the history)</span><input className="f" value={note} onChange={ev => setNote(ev.target.value)} maxLength={300} /></label>
      {(err || save.error) && <div className="err" role="alert">{err || save.error?.message}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
        {!isNew && <button className="btn" disabled={save.isPending || value === String(e!.value)} onClick={() => submit([{ op: 'set', path: e!.path, value: typed() }])}>Save to draft</button>}
        {isNew && mode === 'fact' && <button className="btn" disabled={save.isPending || !key || !value.trim()} onClick={() => submit([{ op: 'set', path: `${parent}.${key}`, value }])}>Add to draft</button>}
        {isNew && mode === 'deadline' && <button className="btn" disabled={save.isPending || !dl.name || !dl.date} onClick={() => submit([{ op: 'addItem', path: 'deadlines', value: dl }])}>Add to draft</button>}
        {itemRoot && <button className="btn alt" disabled={save.isPending} onClick={() => confirm(`Remove ${itemRoot} from the draft?`) && submit([{ op: 'removeItem', path: itemRoot }])}>Remove this item</button>}
        <button className="btn alt" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

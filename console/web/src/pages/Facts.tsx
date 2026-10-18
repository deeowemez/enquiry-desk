import { Fragment, useMemo, useState } from 'react';
import type { FactDiff, FactEntry, FactSetInfo, FactsState, Job } from '../../../shared/api';
import { useApi, useJob, useSend } from '../api';
import { FactEditor } from '../components/FactEditor';
import { JobPanel } from '../components/JobPanel';
import { ago } from '../format';
import { Dialog, Status } from '../ui';

const show = (v: unknown) => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? ''));

function DiffTable({ diff }: { diff: FactDiff[] }) {
  if (!diff.length) return <div className="empty">No differences.</div>;
  return <table className="diff"><thead><tr><th>Fact</th><th>Before</th><th>After</th></tr></thead><tbody>
    {diff.map(d => <tr key={d.path}><td><span className="ref">{d.path}</span></td><td>{d.kind === 'added' ? <span className="mut">—</span> : <span className={d.kind === 'removed' || d.kind === 'changed' ? 'del' : ''}>{show(d.before)}</span>}</td><td>{d.kind === 'removed' ? <span className="mut">removed</span> : <span className="add">{show(d.after)}</span>}</td></tr>)}
  </tbody></table>;
}

export function Facts() {
  const q = useApi<FactsState>('/api/facts');
  const job = useJob();
  const [topic, setTopic] = useState('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<FactEntry | 'new' | null>(null);
  const [confirm, setConfirm] = useState<'publish' | { restore: FactSetInfo } | null>(null);
  const [recheck, setRecheck] = useState({ topic: 'scheduling', limit: 14 });
  const apply = useSend<FactsState>('POST', '/api/facts/draft/apply');
  const discard = useSend<FactsState>('DELETE', '/api/facts/draft');
  const gate = useSend<Job>('POST', '/api/jobs/gate');
  const impact = useSend<Job, { topic: string; limit: number }>('POST', '/api/jobs/impact');
  const s = q.data;
  const running = job.data?.status === 'running';

  const rows = useMemo(() => (s?.entries ?? []).filter(e =>
    (!topic || (topic === 'none' ? e.topics.length === 0 : e.topics.includes(topic))) &&
    (!search || `${e.path} ${e.label} ${e.value}`.toLowerCase().includes(search.toLowerCase()))), [s, topic, search]);

  const diffStg = s?.diffStagingVsProduction ?? [];
  const tested = s?.staging?.gatePassed === true, failed = s?.staging?.gateRun != null && s?.staging?.gatePassed === false;
  const step = s?.draft ? 1 : diffStg.length === 0 ? 0 : tested ? 4 : 3;
  const err = apply.error ?? discard.error ?? gate.error ?? impact.error;

  return (
    <Status error={q.error} loading={!s}>
      {s && <>
        {!s.workflowReadsDatabase && <div className="banner attn"><span style={{ fontSize: 20 }}>!</span><div>The live workflow is not reading this table yet<small>Staging reads it, and you can edit and test here. Publishing to production records the new version but changes no customer reply until the updated workflow is promoted.</small></div></div>}

        <div className="steps" aria-label="How a change gets to customers">
          {[['1', 'Edit a draft', s.draft ? `Draft v${s.draft.version} by ${s.draft.createdBy}` : 'No draft'], ['2', 'Apply to staging', s.draft ? 'Ready to apply' : `Staging serves v${s.staging?.version}`],
            ['3', 'Test (24 cases)', failed ? 'Did not pass' : tested ? `Passed · ${s.staging?.gateRun}` : diffStg.length ? 'Not tested yet' : 'Nothing to test'], ['4', 'Publish', diffStg.length ? (tested ? 'Ready to publish' : 'After it passes') : `Production is v${s.production?.version}`]]
            .map(([n, t, sub], i) => <div key={n} className={`stp ${i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''}`}><b>{n}. {t}</b><small>{sub}</small></div>)}
        </div>

        <div className="row">
          <div className="card grow">
            <div className="filters" style={{ marginBottom: 12 }}>
              <input className="chip" placeholder="Search facts" aria-label="Search facts" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="chip" aria-label="Topic" value={topic} onChange={e => setTopic(e.target.value)}><option value="">Topic: All</option>{s.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Not shown to any topic</option></select>
              <span className="note" style={{ marginLeft: 'auto' }}>{s.entriesFrom === 'draft' ? `Showing your draft (v${s.draft?.version})` : `Showing what staging serves (v${s.staging?.version})`} · {rows.length} facts</span>
              <button className="btn" onClick={() => setEdit('new')}>+ Add fact</button>
            </div>
            <div className="scroll"><table><thead><tr><th>Fact</th><th>What the system may say</th><th>Used for</th><th /></tr></thead><tbody>
              {rows.map((e, i) => (
                <Fragment key={e.path}>
                  {(i === 0 || rows[i - 1]!.group !== e.group) && <tr key={`g-${e.group}-${i}`}><td colSpan={4} className="mut" style={{ background: 'var(--bg)', fontWeight: 600, textTransform: 'capitalize' }}>{e.group}</td></tr>}
                  <tr key={e.path} style={e.changed ? { background: 'var(--soft1)' } : undefined}>
                    <td>{e.label}<div className="ref">{e.path}</div></td>
                    <td>{show(e.value)}{e.changed === 'changed' && <div className="note">was: <span className="del">{show(e.before)}</span></div>}{e.changed === 'added' && <div><span className="pill p-auto">new</span></div>}</td>
                    <td className="mut">{e.topics.length ? e.topics.map(t => t.replace(/_/g, ' ')).join(', ') : 'none'}</td>
                    <td className="right"><button className="btn alt" onClick={() => setEdit(e)} aria-label={`Edit ${e.label}`}>Edit</button></td>
                  </tr>
                </Fragment>))}
            </tbody></table></div>
          </div>

          <div className="fixed" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card"><h3>Next step</h3><div className="sub">A wrong fact is repeated confidently and passes every check, so each change is tested before it can go live.</div>
              {err && <div className="err" role="alert">{err.message}</div>}
              {s.draft && <>
                <DiffTable diff={s.diffVsStaging} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={running || apply.isPending} onClick={() => apply.mutate()}>Apply to staging</button>
                  <button className="btn alt" disabled={running || discard.isPending} onClick={() => discard.mutate()}>Discard draft</button>
                </div></>}
              {!s.draft && diffStg.length > 0 && <>
                <div className="note" style={{ marginBottom: 6 }}>Staging has {diffStg.length} change{diffStg.length === 1 ? '' : 's'} production does not:</div>
                <DiffTable diff={diffStg} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={running || gate.isPending} onClick={() => gate.mutate()}>{failed ? 'Re-run the 24-case test' : 'Run the 24-case test'}</button>
                  <button className="btn" disabled={!s.canPublish.ok || running} onClick={() => setConfirm('publish')} title={s.canPublish.reason}>Publish to production…</button>
                </div>
                <div className="note" style={{ marginTop: 6 }}>{s.canPublish.reason}</div></>}
              {!s.draft && diffStg.length === 0 && <div className="callout">Staging and production have the same facts (production v{s.production?.version}). Edit a fact to start a change.</div>}
            </div>

            <div className="card"><h3>Re-check past enquiries</h3><div className="sub">Re-send recent enquiries to staging with the facts it serves now, and see which outcomes change. Nothing is sent to anyone.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select className="f" style={{ flex: 1 }} aria-label="Topic to re-check" value={recheck.topic} onChange={e => setRecheck({ ...recheck, topic: e.target.value })}>{s.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <select className="f" style={{ width: 90 }} aria-label="How many" value={recheck.limit} onChange={e => setRecheck({ ...recheck, limit: Number(e.target.value) })}>{[5, 14, 30].map(n => <option key={n} value={n}>{n}</option>)}</select>
                <button className="btn" disabled={running || impact.isPending} onClick={() => impact.mutate(recheck)}>Re-check</button>
              </div>
            </div>

            <div className="card"><h3>Production history</h3><div className="sub">Every published version is kept. Restoring one publishes it again as the newest.</div>
              <table><tbody>{s.history.slice(0, 6).map(h => <tr key={h.version}>
                <td><b>v{h.version}</b> {h.status === 'live' && <span className="pill p-ok">live</span>}<div className="note">{h.note ?? ''}</div><div className="note">{h.publishedBy} · {ago(h.publishedAt ?? h.createdAt)}</div></td>
                <td className="right">{h.status !== 'live' && <button className="btn alt" disabled={running} onClick={() => setConfirm({ restore: h })}>Restore</button>}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>

        <div className="card"><h3>Latest test or re-check</h3><div className="sub">One runs at a time, on staging.</div><JobPanel job={job.data} /></div>

        {edit && <FactEditor target={edit} onClose={() => setEdit(null)} />}
        {confirm && <ConfirmDialog what={confirm} state={s} onClose={() => setConfirm(null)} />}
      </>}
    </Status>
  );
}

function ConfirmDialog({ what, state, onClose }: { what: 'publish' | { restore: FactSetInfo }; state: FactsState; onClose: () => void }) {
  const publish = useSend<FactsState, { confirm: true; note?: string }>('POST', '/api/facts/publish');
  const restore = useSend<FactsState, { confirm: true; version: number }>('POST', '/api/facts/restore');
  const [note, setNote] = useState('');
  const [ok, setOk] = useState(false);
  const isPub = what === 'publish';
  const m = isPub ? publish : restore;
  return (
    <Dialog title="Confirm" kind="modal" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center' }}><div style={{ fontSize: 17, fontWeight: 650 }}>{isPub ? `Publish staging v${state.staging?.version} to production` : `Restore production v${(what as { restore: FactSetInfo }).restore.version}`}</div><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      <div style={{ height: 10 }} />
      {isPub ? <><div className="sub">What changes in production ({state.canPublish.reason}):</div><DiffTable diff={state.diffStagingVsProduction} /></> : <div className="callout">The old version is published again as the newest production version.</div>}
      {!state.workflowReadsDatabase && <div className="callout" style={{ marginTop: 10 }}>The live workflow does not read this table yet, so this records the version but changes no reply until the workflow is promoted.</div>}
      {isPub && <label className="field" style={{ marginTop: 10 }}><span>Note (optional)</span><input className="f" value={note} onChange={e => setNote(e.target.value)} maxLength={300} /></label>}
      <label className="chip" style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I understand replies to customers are grounded on these facts.</label>
      {m.error && <div className="err" role="alert">{m.error.message}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn danger" disabled={!ok || m.isPending} onClick={() => (isPub ? publish.mutate({ confirm: true, note: note || undefined }, { onSuccess: onClose }) : restore.mutate({ confirm: true, version: (what as { restore: FactSetInfo }).restore.version }, { onSuccess: onClose }))}>{isPub ? 'Publish to production' : 'Restore'}</button>
        <button className="btn alt" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

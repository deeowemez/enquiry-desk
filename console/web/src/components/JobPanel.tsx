import type { Job } from '../../../shared/api';
import { OUTCOME_LABEL } from '../../../shared/labels';
import { useSend } from '../api';
import { ago } from '../format';

const ORDER = ['auto_send', 'clarify', 'escalate', 'blocked', 'failed'];
const name = (o: string) => OUTCOME_LABEL[o as keyof typeof OUTCOME_LABEL] ?? o;

/** Progress and result of the current test run or re-check. */
export function JobPanel({ job, kind }: { job: Job | null | undefined; kind?: Job['kind'] }) {
  const cancel = useSend('POST', '/api/jobs/cancel');
  if (!job || (kind && job.kind !== kind)) return <div className="empty">Nothing has been run yet.</div>;
  const pct = job.progress.total ? Math.round((100 * job.progress.done) / job.progress.total) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{job.label}</b>
        <span className={`pill ${job.status === 'running' ? 'p-wait' : job.status === 'done' ? (job.gate && !job.gate.passed ? 'p-fail' : 'p-ok') : 'p-fail'}`}>
          {job.status === 'running' ? 'Running…' : job.status === 'done' ? (job.gate ? (job.gate.passed ? '✓ Passed the gate' : '✕ Did not pass') : '✓ Done') : job.status === 'cancelled' ? 'Cancelled' : 'Failed'}
        </span>
        <span className="mut" style={{ fontSize: 12 }}>started {ago(job.startedAt)} by {job.startedBy}</span>
        {job.status === 'running' && <button className="btn alt" style={{ marginLeft: 'auto' }} onClick={() => cancel.mutate()}>Cancel</button>}
      </div>
      {job.status === 'running' && <div><div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div><div className="note" style={{ marginTop: 4 }}>{job.progress.done} of {job.progress.total || '…'} · about {job.kind === 'gate' ? '5 minutes' : 'a few seconds each'}</div></div>}
      {job.message && job.status !== 'running' && <div className="callout">{job.message}</div>}
      {job.gate && <table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>
        {job.gate.checks.map(c => <tr key={c.name}><td>{c.name}</td><td>{c.pass ? <span className="pill p-ok">✓ Pass</span> : <span className="pill p-fail">✕ Fail</span>}</td><td className="mut">{c.detail}</td></tr>)}
      </tbody></table>}
      {job.impact && <>
        <table><thead><tr><th>{job.impact.total} enquiries</th><th className="right">Before</th><th className="right">After</th></tr></thead><tbody>
          {ORDER.map(o => <tr key={o}><td>{name(o)}</td><td className="right">{job.impact!.before[o] ?? 0}</td><td className="right"><b>{job.impact!.after[o] ?? 0}</b></td></tr>)}
        </tbody></table>
        {job.impact.changed.length > 0 && <div><div style={{ fontWeight: 650, marginBottom: 4 }}>What changed</div>
          <table><tbody>{job.impact.changed.map(c => <tr key={c.ref}><td><span className="ref">{c.ref}</span></td><td>{c.topic}</td><td>{name(c.before)} → <b>{name(c.after)}</b></td></tr>)}</tbody></table></div>}
        <div className="note">Re-checks run on staging: no Gmail draft, no Telegram alert, not counted in the statistics, and the originals are untouched. Results can vary a little between runs.</div>
      </>}
    </div>
  );
}

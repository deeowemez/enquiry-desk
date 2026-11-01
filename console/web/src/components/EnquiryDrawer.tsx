import { useSearchParams } from 'react-router-dom';
import type { EnquiryDetail } from '../../../shared/api';
import { flagLabel, STAGE_LABEL } from '../../../shared/labels';
import { useState } from 'react';
import { useApi, useSend } from '../api';
import { useJob } from '../api';
import { JobPanel } from './JobPanel';
import type { Job } from '../../../shared/api';
import { money, when } from '../format';
import { Check, Copy, ExternalLink, Flag, OctagonX, X } from 'lucide-react';
import { Dialog, Hint, OutcomePill } from '../ui';

const STAGE_NOTE: Record<string, string> = { intake: 'Saved before any model call', normalise: 'Saved before any model call' };

export function EnquiryDrawer({ id }: { id: string }) {
  const [sp, setSp] = useSearchParams();
  const close = () => { const n = new URLSearchParams(sp); n.delete('e'); setSp(n); };
  const q = useApi<EnquiryDetail>(`/api/enquiries/${id}`);
  const d = q.data;
  return (
    <Dialog title="Enquiry detail" kind="drawer" onClose={close}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 650 }}>Enquiry {id.slice(0, 8)}</div>
          {d && <div className="mut" style={{ fontSize: 12.5 }}>{d.row.topic}, received {when(d.row.receivedAt)}</div>}
        </div>
        <button className="x" onClick={close} aria-label="Close"><X size={20} aria-hidden /></button>
      </div>
      {q.error && <div className="err" role="alert">{(q.error as Error).message}</div>}
      {!d && !q.error && <div className="empty">Loading…</div>}
      {d && <Detail d={d} />}
    </Dialog>
  );
}

function Detail({ d }: { d: EnquiryDetail }) {
  const r = d.row;
  const [showCheck, setShowCheck] = useState(false);
  const job = useJob();
  const start = useSend<Job, { ids: string[] }>('POST', '/api/jobs/impact');
  const total = d.stages.reduce((a, s) => a + s.costUsd, 0);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <OutcomePill o={r.outcome} />
        {r.review && <span className="pill p-wait">{r.review}</span>}
        {r.flags.map(f => <span key={f} className="pill p-fail"><Flag size={12} aria-hidden />{flagLabel(f)}</span>)}
        {d.hasDraft && <span className="pill p-ok"><Check size={12} strokeWidth={2.5} aria-hidden />Gmail draft created</span>}
      </div>
      <div className="callout"><b>Why:</b> {r.reason}</div>
      <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 12px', fontSize: 13 }}>
        <dt className="mut">Language</dt><dd>{d.language ?? '—'}</dd>
        <dt className="mut">Classifier confidence</dt><dd>{d.confidence ?? '—'} <Hint text="Recorded, never used for routing." /></dd>
        <dt className="mut">Missing details</dt><dd>{d.missingSlots.length ? d.missingSlots.join(', ').replace(/_/g, ' ') : 'None'}</dd>
      </dl>
      <div>
        <div style={{ fontWeight: 650, marginBottom: 4 }}>Timeline</div>
        <div className="step"><div className="dot"><Check size={11} strokeWidth={3} aria-hidden /></div><div><b>Received</b><small>Saved before any model call</small></div><div /></div>
        {d.stages.filter(s => s.stage !== 'intake').map((s, i) => {
          const bad = s.status === 'failed', stop = bad && s.stage === 'validate';
          return (
            <div className="step" key={`${s.stage}-${i}`}>
              <div className={`dot ${stop ? 'stop' : bad ? 'bad' : ''}`}>{stop ? <OctagonX size={11} strokeWidth={3} aria-hidden /> : bad ? <X size={11} strokeWidth={3} aria-hidden /> : <Check size={11} strokeWidth={3} aria-hidden />}</div>
              <div>
                <b>{STAGE_LABEL[s.stage] ?? s.stage}</b>
                <small>{stop ? 'A check stopped the reply' : bad ? `Failed${s.errorKind ? `: ${s.errorKind}` : ''}` : s.model ? `${s.model.replace(/^(global|apac)\.amazon\./, '').replace(/-v1:0$/, '')}${s.attempt > 1 ? `, attempt ${s.attempt}` : ''}` : (STAGE_NOTE[s.stage] ?? 'Done in code')}</small>
              </div>
              <div className="mut num" style={{ fontSize: 12, textAlign: 'right' }}>{s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)} s` : '—'}{s.costUsd ? <div>{money(s.costUsd)}</div> : null}</div>
            </div>
          );
        })}
      </div>
      <div className="hide">Customer details and message text aren't shown here. {d.reviewUrl ? 'They are on the private review page.' : d.hasDraft ? "The reply is a Gmail draft in the mailbox's Drafts folder." : 'Only escalated and blocked enquiries have a review page.'}</div>
      {showCheck && <div className="card"><h3>Re-check on staging <Hint text="Runs this enquiry again with the facts staging serves now. Nothing is sent to anyone." /></h3>{start.error && <div className="err" role="alert">{start.error.message}</div>}<JobPanel job={job.data} kind="impact" /></div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
        {d.reviewUrl ? <a className="btn" href={d.reviewUrl} target="_blank" rel="noopener noreferrer">Open review page<ExternalLink size={14} aria-hidden /></a> : <span className="btn" aria-disabled="true">Open review page<ExternalLink size={14} aria-hidden /></span>}
        {d.gmailUrl && <a className="btn alt" href={d.gmailUrl} target="_blank" rel="noopener noreferrer">Open in Gmail<ExternalLink size={14} aria-hidden /></a>}
        <button className="btn alt" disabled={start.isPending || job.data?.status === 'running'} onClick={() => { setShowCheck(true); start.mutate({ ids: [d.row.id] }); }}>Re-check on staging</button>
        <button className="btn alt" onClick={() => navigator.clipboard?.writeText(d.row.id)}><Copy size={14} aria-hidden />Copy ID</button>
        <span className="total">Total cost <b>{money(total || r.costUsd)}</b></span>
      </div>
    </>
  );
}

import { useSearchParams } from 'react-router-dom';
import type { EnquiryDetail } from '../../../shared/api';
import { flagLabel, STAGE_LABEL } from '../../../shared/labels';
import { useApi } from '../api';
import { money, when } from '../format';
import { Dialog, OutcomePill } from '../ui';

const STAGE_NOTE: Record<string, string> = { intake: 'saved before any model call', normalise: 'saved before any model call' };

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
          {d && <div className="mut" style={{ fontSize: 12.5 }}>Received {when(d.row.receivedAt)} HK · {d.row.topic}</div>}
        </div>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </div>
      {q.error && <div className="err" role="alert">{(q.error as Error).message}</div>}
      {!d && !q.error && <div className="empty">Loading…</div>}
      {d && <Detail d={d} />}
    </Dialog>
  );
}

function Detail({ d }: { d: EnquiryDetail }) {
  const r = d.row;
  const total = d.stages.reduce((a, s) => a + s.costUsd, 0);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <OutcomePill o={r.outcome} />
        {r.review && <span className="pill p-wait">{r.review}</span>}
        {r.flags.map(f => <span key={f} className="pill p-fail">⚑ {flagLabel(f)}</span>)}
        {d.hasDraft && <span className="pill p-ok">✓ Gmail draft created</span>}
      </div>
      <div className="callout"><b>Why:</b> {r.reason}.</div>
      <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 12px', fontSize: 13 }}>
        <dt className="mut">Language</dt><dd>{d.language ?? '—'}</dd>
        <dt className="mut">Classifier confidence</dt><dd>{d.confidence ?? '—'} <span className="mut">(recorded, never used for routing)</span></dd>
        <dt className="mut">Missing details</dt><dd>{d.missingSlots.length ? d.missingSlots.join(', ').replace(/_/g, ' ') : 'none'}</dd>
      </dl>
      <div>
        <div style={{ fontWeight: 650, marginBottom: 4 }}>What happened, step by step</div>
        <div className="step"><div className="dot">✓</div><div><b>Received</b><small>saved to the database before any model call</small></div><div /></div>
        {d.stages.filter(s => s.stage !== 'intake').map((s, i) => {
          const bad = s.status === 'failed', stop = bad && s.stage === 'validate';
          return (
            <div className="step" key={`${s.stage}-${i}`}>
              <div className={`dot ${stop ? 'stop' : bad ? 'bad' : ''}`}>{stop ? '!' : bad ? '✕' : '✓'}</div>
              <div>
                <b>{STAGE_LABEL[s.stage] ?? s.stage}</b>
                <small>{stop ? 'a check stopped the reply' : bad ? `failed${s.errorKind ? `: ${s.errorKind}` : ''}` : s.model ? `${s.model.replace(/^(global|apac)\.amazon\./, '').replace(/-v1:0$/, '')}${s.attempt > 1 ? ` · attempt ${s.attempt}` : ''}` : (STAGE_NOTE[s.stage] ?? 'done in code')}</small>
              </div>
              <div className="mut" style={{ fontSize: 12, textAlign: 'right' }}>{[s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)} s` : '', s.costUsd ? money(s.costUsd) : ''].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          );
        })}
      </div>
      <div className="hide">▣ Customer name, email, subject, message and draft text are not shown in this console. {d.reviewUrl ? 'Use the button below to read them on the private review page.' : d.hasDraft ? "The reply is a Gmail draft in the mailbox's Drafts folder." : 'Only escalated and blocked enquiries have a review page.'}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
        {d.reviewUrl ? <a className="btn" href={d.reviewUrl} target="_blank" rel="noopener noreferrer">Open draft on review page ↗</a> : <span className="btn" aria-disabled="true">Open draft on review page ↗</span>}
        <button className="btn alt" onClick={() => navigator.clipboard?.writeText(d.row.id)}>Copy id</button>
        <span className="btn alt" style={{ marginLeft: 'auto' }} aria-disabled="true">Total cost {money(total || r.costUsd)}</span>
      </div>
    </>
  );
}

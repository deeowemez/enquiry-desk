import { useSearchParams } from 'react-router-dom';
import type { Blocked as B, EnquiryPage } from '../../../shared/api';
import { blockLabel } from '../../../shared/labels';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { Dialog, HBars, SimpleBars, Status } from '../ui';

export function Blocked() {
  const { params } = useRange();
  const [sp, setSp] = useSearchParams();
  const kind = sp.get('kind');
  const q = useApi<B>('/api/blocked', params);
  const b = q.data;
  const pick = (k: string | null) => { const n = new URLSearchParams(sp); k ? n.set('kind', k) : n.delete('kind'); setSp(n); };
  return (
    <Status error={q.error} loading={!b}>
      {b && <>
        <div className="row">
          <div className="card grow"><h3>Blocked replies by reason</h3><div className="sub">A reply can have several problems · the reason names are set by the system, not copied from the customer</div>
            <HBars items={b.reasons.map(r => ({ key: r.kind, label: r.label, value: r.problems }))} onPick={pick} /></div>
          <div className="card fixed"><h3>Blocked share of drafts</h3><div className="sub">Blocking is the system working, not failing</div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{b.share.pct}%</div><div className="mut">{b.share.blocked} of {b.share.of} processed enquiries</div></div>
        </div>
        <div className="row">
          <div className="card grow"><h3>Blocked per day</h3><div className="sub">Spikes after a prompt or fact-table change are worth a look</div>
            <SimpleBars data={b.perDay.map(d => ({ day: d.day, v: d.blocked }))} color="var(--s4)" label="Blocked replies per day" steps={Math.max(1, Math.min(4, Math.max(...b.perDay.map(d => d.blocked))))} fmt={v => String(Math.round(v))} /></div>
          <div className="card fixed"><h3>Questions the fact table couldn't answer</h3><div className="sub">By topic. Which fact is missing isn't recorded yet.</div>
            <HBars items={b.unansweredByTopic.map(t => ({ key: t.topic, label: t.topic, value: t.count }))} color="var(--s2)" /></div>
        </div>
        {kind && <KindModal kind={kind} onClose={() => pick(null)} />}
      </>}
    </Status>
  );
}

function KindModal({ kind, onClose }: { kind: string; onClose: () => void }) {
  const { params } = useRange();
  const q = useApi<EnquiryPage>(`/api/blocked/${encodeURIComponent(kind)}`, params);
  return (
    <Dialog title="Blocked enquiries" kind="modal" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center' }}><div><div style={{ fontSize: 17, fontWeight: 650 }}>{blockLabel(kind)}</div><div className="mut" style={{ fontSize: 12.5 }}>{q.data ? `${q.data.total} enquiries` : 'Loading…'}</div></div><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      <div style={{ height: 12 }} />
      <Status error={q.error} loading={!q.data}>{q.data && <><EnquiryTable rows={q.data.rows} compact />{q.data.total > q.data.rows.length && <div className="note" style={{ marginTop: 10 }}>Showing the latest {q.data.rows.length} of {q.data.total}. Use Enquiries to see the rest.</div>}</>}</Status>
    </Dialog>
  );
}

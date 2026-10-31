import { useSearchParams } from 'react-router-dom';
import type { Blocked as B, EnquiryPage } from '../../../shared/api';
import { blockLabel } from '../../../shared/labels';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { X } from 'lucide-react';
import { CardHead, Dialog, HBars, SimpleBars, Status } from '../ui';

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
          <div className="card grow"><CardHead title="Blocked replies by reason" hint="A reply can have several problems. Click a reason to see its enquiries." />
            <HBars items={b.reasons.map(r => ({ key: r.kind, label: r.label, value: r.problems }))} onPick={pick} /></div>
          <div className="card fixed"><CardHead title="Blocked share of drafts" />
            <div className="big">{b.share.pct}%</div><div className="mut">{b.share.blocked} of {b.share.of} processed enquiries</div></div>
        </div>
        <div className="row">
          <div className="card grow"><CardHead title="Blocked per day" />
            <SimpleBars data={b.perDay.map(d => ({ day: d.day, v: d.blocked }))} color="var(--s4)" label="Blocked replies per day" steps={Math.max(1, Math.min(4, Math.max(...b.perDay.map(d => d.blocked))))} fmt={v => String(Math.round(v))} /></div>
          <div className="card fixed"><CardHead title="Unanswered questions by topic" hint="Questions the fact table couldn't answer." />
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
      <div style={{ display: 'flex', alignItems: 'center' }}><div><div style={{ fontSize: 17, fontWeight: 650 }}>{blockLabel(kind)}</div><div className="mut" style={{ fontSize: 12.5 }}>{q.data ? `${q.data.total} enquiries` : 'Loading…'}</div></div><button className="x" onClick={onClose} aria-label="Close"><X size={20} aria-hidden /></button></div>
      <div style={{ height: 12 }} />
      <Status error={q.error} loading={!q.data}>{q.data && <><EnquiryTable rows={q.data.rows} compact />{q.data.total > q.data.rows.length && <div className="note" style={{ marginTop: 10 }}>Latest {q.data.rows.length} of {q.data.total}</div>}</>}</Status>
    </Dialog>
  );
}

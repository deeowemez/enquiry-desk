import { useState } from 'react';
import type { EnquiryPage } from '../../../shared/api';
import { OUTCOME_LABEL, TOPIC_LABEL } from '../../../shared/labels';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { Status } from '../ui';

export function Enquiries() {
  const { params } = useRange();
  const [f, setF] = useState({ q: '', outcome: '', topic: '', review: '', flagged: false, page: 1 });
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, page: 1, ...p }));
  const q = useApi<EnquiryPage>('/api/enquiries', { ...params, q: f.q.trim(), outcome: f.outcome, topic: f.topic, review: f.review, flagged: f.flagged ? '1' : undefined, page: f.page });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <>
      <div className="filters">
        <input className="chip" placeholder="Search by reference" aria-label="Search by reference" value={f.q} onChange={e => set({ q: e.target.value.replace(/[^0-9a-f-]/gi, '') })} />
        <select className="chip" aria-label="Outcome" value={f.outcome} onChange={e => set({ outcome: e.target.value })}><option value="">Outcome: All</option>{Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="chip" aria-label="Topic" value={f.topic} onChange={e => set({ topic: e.target.value })}><option value="">Topic: All</option>{Object.entries(TOPIC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="chip" aria-label="Review" value={f.review} onChange={e => set({ review: e.target.value })}><option value="">Review: All</option><option value="pending">Waiting</option><option value="approved">Approved</option><option value="taken_over">Taken over</option></select>
        <label className="chip"><input type="checkbox" checked={f.flagged} onChange={e => set({ flagged: e.target.checked })} /> ⚑ Flagged only</label>
        <span className="note" style={{ marginLeft: 'auto' }}>{q.data ? `${q.data.total} enquiries` : ''} · customer name, email and message are never shown</span>
      </div>
      <Status error={q.error} loading={!q.data}>
        {q.data && <div className="card" style={{ padding: '6px 8px' }}><EnquiryTable rows={q.data.rows} /></div>}
      </Status>
      <div className="pager">
        <button className="btn alt" disabled={f.page <= 1} onClick={() => setF(x => ({ ...x, page: x.page - 1 }))}>‹ Previous</button>
        <span>Page {f.page} of {pages}</span>
        <button className="btn alt" disabled={f.page >= pages} onClick={() => setF(x => ({ ...x, page: x.page + 1 }))}>Next ›</button>
      </div>
    </>
  );
}

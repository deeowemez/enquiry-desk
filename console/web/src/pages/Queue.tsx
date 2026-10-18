import { useState } from 'react';
import type { EnquiryPage } from '../../../shared/api';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { Status } from '../ui';

export function Queue() {
  const { params } = useRange();
  const [safety, setSafety] = useState(false);
  const q = useApi<EnquiryPage>('/api/queue', { ...params, flagged: safety ? '1' : undefined });
  return (
    <>
      <div className="filters">
        <label className="chip"><input type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} /> ⚑ Safety cases only</label>
        <span className="note" style={{ marginLeft: 'auto' }}>{q.data ? `Showing ${q.data.rows.length} of ${q.data.total} · ` : ''}longest waiting first · opens the detail, then the review page where you approve or take over</span>
      </div>
      <Status error={q.error} loading={!q.data}>
        {q.data && <div className="card"><EnquiryTable rows={q.data.rows} compact /></div>}
      </Status>
      <div className="card"><h3>What "waiting" means</h3><div className="sub" style={{ margin: '6px 0 0' }}>The system stopped and nobody has approved or taken over yet. Nothing is sent to a customer automatically: approving creates a Gmail <b>draft</b> that a person sends.</div></div>
    </>
  );
}

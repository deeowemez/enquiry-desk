import { useState } from 'react';
import type { EnquiryPage } from '../../../shared/api';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { Flag } from 'lucide-react';
import { Hint, Status } from '../ui';

export function Queue() {
  const { params } = useRange();
  const [safety, setSafety] = useState(false);
  const q = useApi<EnquiryPage>('/api/queue', { ...params, flagged: safety ? '1' : undefined });
  return (
    <>
      <div className="filters">
        <button className={`toggle${safety ? ' on' : ''}`} aria-pressed={safety} onClick={() => setSafety(!safety)}><Flag size={13} aria-hidden />Safety cases only</button>
        <span className="count">{q.data ? `${q.data.total} waiting` : ''}<Hint text="Longest waiting first. Nothing is sent automatically: approving on the review page creates a Gmail draft that a person sends." /></span>
      </div>
      <Status error={q.error} loading={!q.data}>
        {q.data && <div className="card"><EnquiryTable rows={q.data.rows} compact /></div>}
      </Status>
    </>
  );
}

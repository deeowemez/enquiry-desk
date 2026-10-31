import type { Health as H } from '../../../shared/api';
import { useApi } from '../api';
import { ago, when } from '../format';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { CardHead, Status } from '../ui';
import { Tile } from './Overview';

export function Health() {
  const q = useApi<H>('/api/health');
  const h = q.data;
  const bad = h ? h.deadLetter + h.stuck > 0 : false;
  return (
    <Status error={q.error} loading={!h}>
      {h && <>
        {bad
          ? <div className="banner attn"><CircleAlert size={20} aria-hidden /><div>Something needs attention<small>{h.deadLetter} failed and not replayed, {h.stuck} stuck. Ask your developer to replay them.</small></div></div>
          : <div className="banner ok"><CircleCheck size={20} aria-hidden /><div>All systems working<small>Last enquiry processed {ago(h.lastProcessedAt)}</small></div></div>}
        <div className="tiles">
          <Tile k="Dead letter" v={String(h.deadLetter)} tone={h.deadLetter ? 'bad' : 'good'} n="Failed, not replayed" />
          <Tile k="Stuck" v={String(h.stuck)} tone={h.stuck ? 'bad' : 'good'} n="Unfinished after 10 min" />
          <Tile k="Failures (24 h)" v={String(h.failures24h)} tone={h.failures24h ? 'bad' : 'good'} n="Excludes blocked replies" />
          <Tile k="Last processed" v={ago(h.lastProcessedAt)} n={h.lastProcessedAt ? when(h.lastProcessedAt) : ''} />
        </div>
        <div className="card"><CardHead title="Recent failures" />
          {h.recentFailures.length ? <div className="scroll"><table><thead><tr><th>Ref</th><th>When</th><th>Failed at</th><th>Cause</th><th>Status</th></tr></thead>
            <tbody>{h.recentFailures.map(f => <tr key={f.ref + f.at}><td><span className="ref">{f.ref}</span></td><td>{when(f.at)}</td><td>{f.stage}</td><td>{f.cause.charAt(0).toUpperCase() + f.cause.slice(1)}</td><td>{f.status === 'replayed' ? <span className="pill p-ok">Replayed</span> : <span className="pill p-fail">Open</span>}</td></tr>)}</tbody></table></div> : <div className="empty">No failures recorded.</div>}</div>
      </>}
    </Status>
  );
}

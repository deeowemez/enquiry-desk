import type { Health as H } from '../../../shared/api';
import { useApi } from '../api';
import { ago, when } from '../format';
import { Status } from '../ui';
import { Tile } from './Overview';

export function Health() {
  const q = useApi<H>('/api/health');
  const h = q.data;
  const bad = h ? h.deadLetter + h.stuck > 0 : false;
  return (
    <Status error={q.error} loading={!h}>
      {h && <>
        {bad
          ? <div className="banner attn"><span style={{ fontSize: 20 }}>!</span><div>Something needs attention<small>{h.deadLetter} failed and not replayed · {h.stuck} stuck. Ask your developer to replay them.</small></div></div>
          : <div className="banner ok"><span style={{ fontSize: 20 }}>✓</span><div>All systems working<small>Last enquiry processed {ago(h.lastProcessedAt)} · {h.failures24h ? `${h.failures24h} failure${h.failures24h === 1 ? '' : 's'} in the last 24 h, none waiting` : 'nothing failed and waiting'}</small></div></div>}
        <div className="tiles">
          <Tile k="Dead letter" v={String(h.deadLetter)} tone={h.deadLetter ? 'bad' : 'good'} n="failed and not replayed" />
          <Tile k="Stuck" v={String(h.stuck)} tone={h.stuck ? 'bad' : 'good'} n={'"received" for over 10 min'} />
          <Tile k="Failures (24 h)" v={String(h.failures24h)} tone={h.failures24h ? 'bad' : 'good'} n="blocked replies don't count" />
          <Tile k="Last processed" v={ago(h.lastProcessedAt)} n={h.lastProcessedAt ? when(h.lastProcessedAt) + ' HK' : ''} />
        </div>
        <div className="card"><h3>Recent failures</h3><div className="sub">Shows the stage that failed, never the customer's message</div>
          {h.recentFailures.length ? <div className="scroll"><table><thead><tr><th>Ref</th><th>When</th><th>Failed at</th><th>Cause</th><th>Status</th></tr></thead>
            <tbody>{h.recentFailures.map(f => <tr key={f.ref + f.at}><td><span className="ref">{f.ref}</span></td><td>{when(f.at)}</td><td>{f.stage}</td><td>{f.cause}</td><td>{f.status === 'replayed' ? <span className="pill p-ok">✓ Replayed</span> : <span className="pill p-fail">Open</span>}</td></tr>)}</tbody></table></div> : <div className="empty">No failures recorded.</div>}</div>
      </>}
    </Status>
  );
}

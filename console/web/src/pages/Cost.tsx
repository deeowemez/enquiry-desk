import type { Cost as C } from '../../../shared/api';
import { useApi, useRange } from '../api';
import { money } from '../format';
import { SimpleBars, Status } from '../ui';
import { Tile } from './Overview';

export function Cost() {
  const { params } = useRange();
  const q = useApi<C>('/api/cost', params);
  const c = q.data;
  return (
    <Status error={q.error} loading={!c}>
      {c && <>
        <div className="tiles">
          <Tile k="Total spend" v={money(c.totalUsd)} n="covered by AWS credits" />
          <Tile k="Average per enquiry" v={money(c.avgUsd)} n="processed enquiries" />
          <Tile k="Model calls" v={String(c.modelCalls)} n="across the four stages" />
        </div>
        <div className="row">
          <div className="card grow"><h3>Spend per day</h3><div className="sub">Big days are scoring runs (24 cases each)</div>
            <SimpleBars data={c.perDay.map(d => ({ day: d.day, v: d.costUsd }))} color="var(--s1)" label="Spend per day" fmt={money} /></div>
          <div className="card fixed"><h3>Which model runs each stage</h3><div className="sub">From what each run recorded, so a model change shows up here</div>
            <table><thead><tr><th>Stage</th><th>Model</th><th className="right">Calls</th><th className="right">Share of cost</th></tr></thead>
              <tbody>{c.stages.map(s => <tr key={s.stage + s.model}><td>{s.stage}</td><td>{s.model}</td><td className="right">{s.calls}</td><td className="right">{s.sharePct}%</td></tr>)}</tbody></table></div>
        </div>
      </>}
    </Status>
  );
}

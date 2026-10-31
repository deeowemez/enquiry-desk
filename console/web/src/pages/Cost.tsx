import type { Cost as C } from '../../../shared/api';
import { useApi, useRange } from '../api';
import { money } from '../format';
import { CardHead, SimpleBars, Status } from '../ui';
import { Tile } from './Overview';

export function Cost() {
  const { params } = useRange();
  const q = useApi<C>('/api/cost', params);
  const c = q.data;
  return (
    <Status error={q.error} loading={!c}>
      {c && <>
        <div className="tiles">
          <Tile k="Total spend" v={money(c.totalUsd)} n="Covered by AWS credits" />
          <Tile k="Average per enquiry" v={money(c.avgUsd)} n="Processed enquiries" />
          <Tile k="Model calls" v={String(c.modelCalls)} n="Across four stages" />
        </div>
        <div className="row">
          <div className="card grow"><CardHead title="Spend per day" hint="Large days are scoring runs (24 cases each)." />
            <SimpleBars data={c.perDay.map(d => ({ day: d.day, v: d.costUsd }))} color="var(--s1)" label="Spend per day" fmt={money} /></div>
          <div className="card fixed"><CardHead title="Model per stage" hint="From what each run recorded, so a model change shows up here." />
            <table><thead><tr><th>Stage</th><th>Model</th><th className="right">Calls</th><th className="right">Share of cost</th></tr></thead>
              <tbody>{c.stages.map(s => <tr key={s.stage + s.model}><td>{s.stage.charAt(0).toUpperCase() + s.stage.slice(1)}</td><td><span className="ref">{s.model}</span></td><td className="right">{s.calls}</td><td className="right">{s.sharePct}%</td></tr>)}</tbody></table></div>
        </div>
      </>}
    </Status>
  );
}

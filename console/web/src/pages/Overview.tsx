import { Link, useNavigate } from 'react-router-dom';
import type { EnquiryRow, Overview as O } from '../../../shared/api';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { money, hours } from '../format';
import { HBars, Legend, StackedBars, Status } from '../ui';

const KEYS = ['auto_send', 'clarify', 'escalate', 'blocked', 'failed'];

export function Overview() {
  const { params } = useRange();
  const nav = useNavigate();
  const q = useApi<O>('/api/overview', params);
  const o = q.data;
  return (
    <Status error={q.error} loading={!o}>
      {o && <>
        {o.needsPerson.count > 0
          ? <div className="banner attn"><span style={{ fontSize: 20 }}>⚑</span><div>{o.needsPerson.count} enquir{o.needsPerson.count === 1 ? 'y is' : 'ies are'} waiting for a person<small>{o.needsPerson.safety} {o.needsPerson.safety === 1 ? 'is a safety case' : 'are safety cases'}. Oldest has waited {hours(o.needsPerson.oldestHours)}.</small></div><Link className="btn" to="/queue">Review them →</Link></div>
          : <div className="banner ok"><span style={{ fontSize: 20 }}>✓</span><div>Nothing is waiting for a person<small>Everything that needed a decision has one.</small></div></div>}
        <div className="tiles">
          <Tile k="Needs a person" v={String(o.needsPerson.count)} n={o.needsPerson.oldestHours != null ? `oldest waiting ${hours(o.needsPerson.oldestHours)}` : 'queue is empty'} />
          <Tile k="Cleared without a person" v={`${o.cleared.pct}%`} n={`${o.cleared.count} of ${o.cleared.of} · nothing is sent automatically`} />
          <Tile k="Blocked or failed" v={String(o.blockedOrFailed.total)} n={`${o.blockedOrFailed.blocked} blocked · ${o.blockedOrFailed.failed} failed`} />
          <Tile k="Failures (24 h)" v={String(o.health.failures24h)} tone={o.health.failures24h ? 'bad' : 'good'} n={`dead letter ${o.health.deadLetter} · stuck ${o.health.stuck}`} />
          <Tile k="Average cost" v={money(o.cost.avgUsd)} n={`per enquiry · ${money(o.cost.totalUsd)} total`} />
        </div>
        <div className="row">
          <div className="card grow"><h3>Enquiries per day, by outcome</h3><div className="sub">Hong Kong calendar days</div><Legend keys={KEYS} /><StackedBars data={o.daily} keys={KEYS} /></div>
          <div className="card fixed"><h3>Why replies were blocked</h3><div className="sub">Click a bar to see the enquiries</div>
            <HBars items={o.blockReasons.map(r => ({ key: r.kind, label: r.label, value: r.problems }))} onPick={k => nav(`/blocked?kind=${encodeURIComponent(k)}`)} /></div>
        </div>
        <div className="card"><h3>Oldest waiting for a person</h3><div className="sub">Top 3 · customer details are not shown here, only the reference</div>
          {o.oldestWaiting.length ? <EnquiryTable rows={o.oldestWaiting as EnquiryRow[]} compact /> : <div className="empty">Nobody is waiting.</div>}</div>
      </>}
    </Status>
  );
}

export function Tile({ k, v, n, tone }: { k: string; v: string; n: string; tone?: 'good' | 'bad' }) {
  return <div className="tile"><div className="k">{k}</div><div className="v" style={{ color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--crit)' : undefined }}>{v}</div><div className="n">{n}</div></div>;
}

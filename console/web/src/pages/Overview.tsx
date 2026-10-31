import { Link, useNavigate } from 'react-router-dom';
import type { EnquiryRow, Overview as O } from '../../../shared/api';
import { useApi, useRange } from '../api';
import { EnquiryTable } from '../components/EnquiryTable';
import { money, hours } from '../format';
import { CircleCheck, Flag } from 'lucide-react';
import { CardHead, Hint, HBars, Legend, StackedBars, Status } from '../ui';

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
          ? <div className="banner attn"><Flag size={20} aria-hidden /><div>{o.needsPerson.count} enquir{o.needsPerson.count === 1 ? 'y is' : 'ies are'} waiting for a person<small>{o.needsPerson.safety} {o.needsPerson.safety === 1 ? 'is a safety case' : 'are safety cases'}. Oldest has waited {hours(o.needsPerson.oldestHours)}.</small></div><Link className="btn" to="/queue">Review</Link></div>
          : <div className="banner ok"><CircleCheck size={20} aria-hidden /><div>Nothing is waiting for a person</div></div>}
        <div className="tiles">
          <Tile k="Needs a person" v={String(o.needsPerson.count)} n={o.needsPerson.oldestHours != null ? `Oldest ${hours(o.needsPerson.oldestHours)}` : 'Queue empty'} />
          <Tile k="Cleared without a person" v={`${o.cleared.pct}%`} n={`${o.cleared.count} of ${o.cleared.of}`} hint="Passed every check. Nothing is sent automatically: cleared replies become Gmail drafts." />
          <Tile k="Blocked or failed" v={String(o.blockedOrFailed.total)} n={`${o.blockedOrFailed.blocked} blocked, ${o.blockedOrFailed.failed} failed`} />
          <Tile k="Failures (24 h)" v={String(o.health.failures24h)} tone={o.health.failures24h ? 'bad' : 'good'} n={o.health.deadLetter + o.health.stuck ? `${o.health.deadLetter + o.health.stuck} waiting to replay` : 'None waiting'} />
          <Tile k="Average cost" v={money(o.cost.avgUsd)} n={`${money(o.cost.totalUsd)} total`} />
        </div>
        <div className="row">
          <div className="card grow"><CardHead title="Enquiries per day" /><Legend keys={KEYS} /><StackedBars data={o.daily} keys={KEYS} /></div>
          <div className="card fixed"><CardHead title="Why replies were blocked" right={<Link className="link" to="/blocked">View all</Link>} />
            <HBars items={o.blockReasons.map(r => ({ key: r.kind, label: r.label, value: r.problems }))} onPick={k => nav(`/blocked?kind=${encodeURIComponent(k)}`)} /></div>
        </div>
        <div className="card"><CardHead title="Oldest waiting" right={<Link className="link" to="/queue">View all</Link>} />
          {o.oldestWaiting.length ? <EnquiryTable rows={o.oldestWaiting as EnquiryRow[]} compact /> : <div className="empty">Nobody is waiting.</div>}</div>
      </>}
    </Status>
  );
}

export function Tile({ k, v, n, tone, hint }: { k: string; v: string; n: string; tone?: 'good' | 'bad'; hint?: string }) {
  return <div className="tile"><div className="k">{k}{hint && <Hint text={hint} />}</div><div className="v" style={{ color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--crit)' : undefined }}>{v}</div><div className="n">{n}</div></div>;
}

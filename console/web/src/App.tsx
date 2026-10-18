import { NavLink, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import type { Me, Overview } from '../../shared/api';
import { useApi, useRange } from './api';
import { ago } from './format';
import { EnquiryDrawer } from './components/EnquiryDrawer';
import { Blocked } from './pages/Blocked';
import { Cost } from './pages/Cost';
import { Enquiries } from './pages/Enquiries';
import { Health } from './pages/Health';
import { Overview as OverviewPage } from './pages/Overview';
import { Queue } from './pages/Queue';

const NAV: { to: string; label: string; icon: string; soon?: boolean }[] = [
  { to: '/', label: 'Overview', icon: '▦' }, { to: '/queue', label: 'Needs a person', icon: '⚑' }, { to: '/enquiries', label: 'Enquiries', icon: '☰' },
  { to: '/blocked', label: 'Blocked & why', icon: '△' }, { to: '/facts', label: 'Facts', icon: '▤', soon: true }, { to: '/prompts', label: 'Prompts', icon: '✎', soon: true },
  { to: '/cost', label: 'Cost & models', icon: '$' }, { to: '/health', label: 'Health', icon: '♥' },
];
const TITLES: Record<string, string> = { '/': 'Overview', '/queue': 'Needs a person', '/enquiries': 'Enquiries', '/blocked': 'Blocked & why', '/cost': 'Cost & models', '/health': 'Health' };

export function App() {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const { days, traffic, set, params } = useRange();
  const me = useApi<Me>('/api/me');
  const ov = useApi<Overview>('/api/overview', params);
  const e = sp.get('e');
  const fixedRange = pathname === '/health';
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Enquiry Desk<small>Meridian Tutors · staff console</small></div>
        <div style={{ height: 14 }} />
        <nav aria-label="Main">
          {NAV.map(n => n.soon
            ? <span key={n.to} className="nav soon" aria-disabled="true"><span className="ic">{n.icon}</span>{n.label}<span className="tag">soon</span></span>
            : <NavLink key={n.to} to={{ pathname: n.to, search: `?days=${days}&traffic=${traffic}` }} end={n.to === '/'} className={({ isActive }) => `nav${isActive ? ' active' : ''}`}>
                <span className="ic">{n.icon}</span>{n.label}{n.to === '/queue' && ov.data && ov.data.needsPerson.count > 0 && <span className="bd">{ov.data.needsPerson.count}</span>}
              </NavLink>)}
        </nav>
        <div className="sp" />
        <div className="who">{me.data?.name ? `Signed in as ${me.data.name}` : 'Signed in'}<br />{me.data?.login}</div>
      </aside>
      <div className="main">
        <header className="top">
          <h1>{TITLES[pathname] ?? 'Enquiry Desk'}</h1>
          {!fixedRange && <>
            <select className="chip" aria-label="Date range" value={days} onChange={ev => set({ days: Number(ev.target.value) })}>{[7, 14, 30, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}</select>
            <div className="seg" role="group" aria-label="Traffic">{(['real', 'test', 'both'] as const).map(t => <button key={t} className={traffic === t ? 'on' : ''} aria-pressed={traffic === t} onClick={() => set({ traffic: t })}>{t === 'real' ? 'Real' : t === 'test' ? 'Scoring runs' : 'Both'}</button>)}</div>
          </>}
          <span className="chip" title="Refreshes every minute">{ov.dataUpdatedAt ? `Updated ${ago(new Date(ov.dataUpdatedAt).toISOString())}` : '…'}</span>
        </header>
        <main className="body">
          <Routes>
            <Route path="/" element={<OverviewPage />} /><Route path="/queue" element={<Queue />} /><Route path="/enquiries" element={<Enquiries />} />
            <Route path="/blocked" element={<Blocked />} /><Route path="/cost" element={<Cost />} /><Route path="/health" element={<Health />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {e && /^[0-9a-f-]{36}$/i.test(e) && <EnquiryDrawer id={e} />}
    </div>
  );
}

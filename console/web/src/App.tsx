import { NavLink, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Activity, BookOpen, CircleDollarSign, FileText, Flag, Inbox, LayoutDashboard, Loader, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { Me, Overview } from '../../shared/api';
import { useApi, useJob, useRange } from './api';
import { ago } from './format';
import { EnquiryDrawer } from './components/EnquiryDrawer';
import { Blocked } from './pages/Blocked';
import { Cost } from './pages/Cost';
import { Enquiries } from './pages/Enquiries';
import { Facts } from './pages/Facts';
import { Prompts } from './pages/Prompts';
import { Health } from './pages/Health';
import { Overview as OverviewPage } from './pages/Overview';
import { Queue } from './pages/Queue';

const NAV: { to: string; label: string; icon: LucideIcon; soon?: boolean }[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard }, { to: '/queue', label: 'Needs a person', icon: Flag }, { to: '/enquiries', label: 'Enquiries', icon: Inbox },
  { to: '/blocked', label: 'Blocked & why', icon: ShieldAlert }, { to: '/facts', label: 'Facts', icon: BookOpen }, { to: '/prompts', label: 'Prompts', icon: FileText },
  { to: '/cost', label: 'Cost & models', icon: CircleDollarSign }, { to: '/health', label: 'Health', icon: Activity },
];
// Only a first name and initials are shown: the sign-in email never appears on screen.
const firstName = (name?: string) => name?.trim().split(/\s+/)[0] ?? '';
const initials = (name?: string) => (name ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
const TITLES: Record<string, string> = { '/': 'Overview', '/queue': 'Needs a person', '/enquiries': 'Enquiries', '/blocked': 'Blocked & why', '/facts': 'Facts', '/prompts': 'Prompts', '/cost': 'Cost & models', '/health': 'Health' };

export function App() {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const { days, traffic, set, params } = useRange();
  const me = useApi<Me>('/api/me');
  const ov = useApi<Overview>('/api/overview', params);
  const e = sp.get('e');
  const fixedRange = ['/health', '/facts', '/prompts'].includes(pathname);
  const job = useJob();
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Meridian Tutors<small>Enquiry Desk</small></div>
        <div style={{ height: 14 }} />
        <nav aria-label="Main">
          {NAV.map(n => n.soon
            ? <span key={n.to} className="nav soon" aria-disabled="true"><n.icon className="ic" size={17} aria-hidden />{n.label}<span className="tag">soon</span></span>
            : <NavLink key={n.to} to={{ pathname: n.to, search: `?days=${days}&traffic=${traffic}` }} end={n.to === '/'} className={({ isActive }) => `nav${isActive ? ' active' : ''}`}>
                <n.icon className="ic" size={17} aria-hidden />{n.label}{n.to === '/queue' && ov.data && ov.data.needsPerson.count > 0 && <span className="bd">{ov.data.needsPerson.count}</span>}
              </NavLink>)}
        </nav>
        <div className="sp" />
        <div className="who"><span className="avatar" aria-hidden>{initials(me.data?.name)}</span>{firstName(me.data?.name) || 'Signed in'}</div>
      </aside>
      <div className="main">
        <header className="top">
          <h1>{TITLES[pathname] ?? 'Enquiry Desk'}</h1>
          {!fixedRange && <>
            <select className="chip" aria-label="Date range" value={days} onChange={ev => set({ days: Number(ev.target.value) })}>{[7, 14, 30, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}</select>
            <div className="seg" role="group" aria-label="Traffic">{(['real', 'test', 'both'] as const).map(t => <button key={t} className={traffic === t ? 'on' : ''} aria-pressed={traffic === t} onClick={() => set({ traffic: t })}>{t === 'real' ? 'Real' : t === 'test' ? 'Scoring runs' : 'Both'}</button>)}</div>
          </>}
          {job.data?.status === 'running' && <NavLink className="chip" to="/facts"><Loader size={13} aria-hidden /> {job.data.kind === 'gate' ? 'Test' : 'Re-check'} running {job.data.progress.done}/{job.data.progress.total || '…'}</NavLink>}
          <span className="stamp" title="All times are Hong Kong time">HKT</span>
          <span className="stamp" title="Refreshes every minute">{ov.dataUpdatedAt ? `Updated ${ago(new Date(ov.dataUpdatedAt).toISOString())}` : ''}</span>
        </header>
        <main className="body">
          <Routes>
            <Route path="/" element={<OverviewPage />} /><Route path="/queue" element={<Queue />} /><Route path="/enquiries" element={<Enquiries />} />
            <Route path="/blocked" element={<Blocked />} /><Route path="/cost" element={<Cost />} /><Route path="/health" element={<Health />} /><Route path="/facts" element={<Facts />} /><Route path="/prompts" element={<Prompts />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {e && /^[0-9a-f-]{36}$/i.test(e) && <EnquiryDrawer id={e} />}
    </div>
  );
}

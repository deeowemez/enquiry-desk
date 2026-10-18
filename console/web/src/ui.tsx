import { useEffect, useRef, type ReactNode } from 'react';
import type { Outcome } from '../../shared/api';
import { OUTCOME_LABEL } from '../../shared/labels';
import { shortDay } from './format';

const ICON: Record<Outcome, string> = { auto_send: '✓', clarify: '?', escalate: '↗', blocked: '!', failed: '✕', in_progress: '…' };
const CLS: Record<Outcome, string> = { auto_send: 'p-auto', clarify: 'p-clar', escalate: 'p-esc', blocked: 'p-blk', failed: 'p-fail', in_progress: 'p-wait' };
export const OUT_COLOR: Record<string, string> = { auto_send: 'var(--s1)', clarify: 'var(--s2)', escalate: 'var(--s3)', blocked: 'var(--s4)', failed: 'var(--crit)' };

export const OutcomePill = ({ o }: { o: Outcome }) => <span className={`pill ${CLS[o]}`}>{ICON[o]} {OUTCOME_LABEL[o]}</span>;

export function Status({ error, loading, children }: { error: unknown; loading: boolean; children: ReactNode }) {
  if (error) return <div className="card err" role="alert">{(error as Error).message}</div>;
  if (loading) return <div className="card empty">Loading…</div>;
  return <>{children}</>;
}

export function Legend({ keys }: { keys: string[] }) {
  return <div className="legend">{keys.map(k => <span key={k}><i style={{ background: OUT_COLOR[k] }} />{OUTCOME_LABEL[k as Outcome]}</span>)}</div>;
}

/** Stacked daily bars. A 2px surface gap separates segments; each rect has a native tooltip. */
export function StackedBars({ data, keys }: { data: ({ day: string } & Record<string, number | string>)[]; keys: string[] }) {
  const W = 700, H = 250, L = 34, B = H - 28, T = 10;
  const total = (d: Record<string, number | string>) => keys.reduce((a, k) => a + Number(d[k] ?? 0), 0);
  const mx = Math.max(4, Math.ceil(Math.max(...data.map(total)) / 4) * 4);
  const bw = (W - L - 8) / Math.max(data.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Enquiries per day by outcome" style={{ display: 'block' }}>
      {[0, 1, 2, 3, 4].map(g => { const y = B - ((B - T) * g) / 4; return <g key={g}><line x1={L} x2={W - 6} y1={y} y2={y} stroke="var(--grid)" /><text x={L - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round((mx * g) / 4)}</text></g>; })}
      {data.map((d, i) => {
        let y = B; const x = L + i * bw + bw * 0.18;
        return (
          <g key={d.day}>
            {keys.map(k => { const v = Number(d[k] ?? 0); if (!v) return null; const h = ((B - T) * v) / mx; y -= h;
              return <rect key={k} x={x} y={y + 1} width={bw * 0.64} height={Math.max(h - 2, 1)} rx={2} fill={OUT_COLOR[k]}><title>{`${shortDay(d.day)} · ${OUTCOME_LABEL[k as Outcome]}: ${v}`}</title></rect>; })}
            {(data.length <= 10 || i % 2 === 0) && <text x={x + (bw * 0.64) / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{shortDay(d.day)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function SimpleBars({ data, color, label, fmt = (v: number) => String(v), steps = 3 }: { data: { day: string; v: number }[]; color: string; label: string; fmt?: (v: number) => string; steps?: number }) {
  const W = 700, H = 200, L = 46, B = H - 26, T = 8;
  const mx = Math.max(...data.map(d => d.v), 1e-9) * 1.1;
  const bw = (W - L - 6) / Math.max(data.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block' }}>
      {Array.from({ length: steps + 1 }, (_, g) => { const y = B - ((B - T) * g) / steps; return <g key={g}><line x1={L} x2={W - 4} y1={y} y2={y} stroke="var(--grid)" /><text x={L - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt((mx * g) / steps)}</text></g>; })}
      {data.map((d, i) => { const h = ((B - T) * d.v) / mx, x = L + i * bw + bw * 0.2;
        return <g key={d.day}><rect x={x} y={B - h} width={bw * 0.6} height={Math.max(h, d.v > 0 ? 1 : 0)} rx={3} fill={color}><title>{`${shortDay(d.day)}: ${fmt(d.v)}`}</title></rect>{(data.length <= 10 || i % 2 === 0) && <text x={x + bw * 0.3} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--muted)">{shortDay(d.day)}</text>}</g>; })}
    </svg>
  );
}

export function HBars({ items, onPick, color = 'var(--s1)' }: { items: { key: string; label: string; value: number }[]; onPick?: (key: string) => void; color?: string }) {
  const mx = Math.max(...items.map(i => i.value), 1);
  if (!items.length) return <div className="empty">Nothing in this range.</div>;
  return <div>{items.map(i => {
    const inner = <><span>{i.label}</span><div className="track"><div className="bar" style={{ width: `${(100 * i.value) / mx}%`, background: color }} /></div><span className="right">{i.value}</span></>;
    return onPick ? <button key={i.key} className="hbar" onClick={() => onPick(i.key)}>{inner}</button> : <div key={i.key} className="hbar">{inner}</div>;
  })}</div>;
}

/** A dialog: Escape and the scrim close it, focus moves in on open and is returned on close. */
export function Dialog({ title, onClose, kind, children }: { title: string; onClose: () => void; kind: 'drawer' | 'modal'; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} className={kind} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>{children}</div>
    </>
  );
}

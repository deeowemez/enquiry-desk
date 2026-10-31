import { useSearchParams } from 'react-router-dom';
import type { EnquiryRow } from '../../../shared/api';
import { flagLabel } from '../../../shared/labels';
import { money, when } from '../format';
import { Flag } from 'lucide-react';
import { OutcomePill } from '../ui';

/** One table for every enquiry list. Rows open the detail drawer (?e=<id>). */
export function EnquiryTable({ rows, compact = false }: { rows: EnquiryRow[]; compact?: boolean }) {
  const [sp, setSp] = useSearchParams();
  const open = (id: string) => { const n = new URLSearchParams(sp); n.set('e', id); setSp(n); };
  if (!rows.length) return <div className="empty">No enquiries match.</div>;
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>Ref</th><th>Received</th><th>Topic</th><th>Outcome</th><th>Why</th><th>Flags</th><th>Review</th>{!compact && <th className="right">Cost</th>}<th /></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="clickable" onClick={e => { if (!(e.target as HTMLElement).closest('button')) open(r.id); }}>
              <td className="nw"><span className="ref">{r.ref}</span>{r.isTest && <span className="tag" title="Scoring traffic">test</span>}</td>
              <td className="nw">{when(r.receivedAt)}</td><td>{r.topic}</td><td><OutcomePill o={r.outcome} /></td><td>{r.reason}</td>
              <td className="flag">{r.flags.length > 0 && <><Flag size={12} aria-hidden /> {r.flags.map(flagLabel).join(', ')}</>}</td>
              <td className="nw">{r.review || <span className="mut">—</span>}</td>
              {!compact && <td className="right">{money(r.costUsd)}</td>}
              <td className="right"><button className="btn ghost open" onClick={() => open(r.id)} aria-label={`Open enquiry ${r.ref}`}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

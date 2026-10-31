import { useState } from 'react';
import type { Prompts as P } from '../../../shared/api';
import { useApi } from '../api';
import { Lock } from 'lucide-react';
import { CardHead, Status } from '../ui';

export function Prompts() {
  const q = useApi<P>('/api/prompts');
  const [stage, setStage] = useState('draft');
  const cur = q.data?.stages.find(s => s.stage === stage) ?? q.data?.stages[0];
  return (
    <Status error={q.error} loading={!q.data}>
      {q.data && cur && <>
        <div className="filters"><div className="tabs" role="tablist" aria-label="Stage">{q.data.stages.map(s => <button key={s.stage} role="tab" aria-selected={s.stage === cur.stage} className={s.stage === cur.stage ? 'on' : ''} onClick={() => setStage(s.stage)}>{s.label}</button>)}</div>
          <span className="count"><Lock size={13} aria-hidden /> Read-only</span></div>
        <div className="card"><CardHead title={cur.label} right={<span className="ref">{cur.model}</span>} hint="The customer's message and the facts are added by the workflow and are always treated as data, never as instructions." />
          <div className="sub">{cur.purpose}</div>
          <pre className="prompt">{cur.text}</pre>
          <div className="note" style={{ marginTop: 10 }}>Snapshot of <code>{cur.node}</code> from {q.data.source}. Prompts change through staging and the 24-case test.</div></div>
      </>}
    </Status>
  );
}

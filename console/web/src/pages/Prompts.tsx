import { useState } from 'react';
import type { Prompts as P } from '../../../shared/api';
import { useApi } from '../api';
import { Status } from '../ui';

export function Prompts() {
  const q = useApi<P>('/api/prompts');
  const [stage, setStage] = useState('draft');
  const cur = q.data?.stages.find(s => s.stage === stage) ?? q.data?.stages[0];
  return (
    <Status error={q.error} loading={!q.data}>
      {q.data && cur && <>
        <div className="filters"><div className="tabs" role="tablist" aria-label="Stage">{q.data.stages.map(s => <button key={s.stage} role="tab" aria-selected={s.stage === cur.stage} className={s.stage === cur.stage ? 'on' : ''} onClick={() => setStage(s.stage)}>{s.label}</button>)}</div>
          <span className="chip" style={{ marginLeft: 'auto' }}>Read-only</span></div>
        <div className="card"><h3>{cur.label} · instructions to the model</h3>
          <div className="sub">{cur.purpose} Model: <b>{cur.model}</b>. The customer's message and the facts are added by the workflow and are always treated as data, never as instructions.</div>
          <pre className="prompt">{cur.text}</pre>
          <div className="note" style={{ marginTop: 10 }}>A snapshot of the node <code>{cur.node}</code> from {q.data.source}. To change a prompt, edit it in the staging workflow, run the 24-case test, and promote: the safety rules are not editable from here on purpose.</div></div>
      </>}
    </Status>
  );
}

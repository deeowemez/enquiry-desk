import type { Outcome } from './api.js';

export const OUTCOME_LABEL: Record<Outcome, string> = {
  auto_send: 'Cleared',            // passed every check; nothing is sent automatically
  clarify: 'Question drafted',
  escalate: 'To a person',
  blocked: 'Blocked',
  failed: 'Failed',
  in_progress: 'In progress',
};

export const BLOCK_KIND_LABEL: Record<string, string> = {
  "gate 2: facts can't answer": "Facts can't answer it",
  'invented price': 'Invented price',
  'invented percentage': 'Invented percentage',
  'invented link': 'Invented link',
  'time not in facts': 'Time not in facts',
  'date not in facts / unverified': 'Date not in facts / unverified',
  'available subject called unavailable': 'Available subject called unavailable',
  'verifier: unsupported claim': 'Verifier: unsupported claim',
  'verifier: no result': 'Verifier: no result',
  other: 'Other',
};
export const blockLabel = (k: string) => BLOCK_KIND_LABEL[k] ?? 'Other';

const BLOCK_REASON_SENTENCE: Record<string, string> = {
  "gate 2: facts can't answer": "The fact table can't answer this question",
  'invented price': "Quoted a price that isn't in the fact table",
  'invented percentage': "Quoted a percentage that isn't in the fact table",
  'invented link': "Gave a link that isn't in the fact table",
  'time not in facts': "Time not in the fact table",
  'date not in facts / unverified': "Date isn't verified in the facts",
  'available subject called unavailable': 'Called an available subject unavailable',
  'verifier: unsupported claim': 'A claim was not supported by the facts',
  'verifier: no result': 'The claim check returned no result',
  other: 'Stopped by a check',
};

const FLAG_LABEL: Record<string, string> = {
  child_wellbeing: 'Child wellbeing', prompt_injection: 'Injection attempt', complaint: 'Complaint',
  refund_request: 'Refund request', guarantee_sought: 'Guarantee sought',
};
const sentence = (s: string) => { const t = s.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
export const flagLabel = (f: string) => FLAG_LABEL[f] ?? sentence(f);

export const TOPIC_LABEL: Record<string, string> = {
  pricing: 'Pricing', scheduling: 'Scheduling', deadlines: 'Deadlines', course_content: 'Course content',
  access: 'Access', complaint_or_sensitive: 'Complaint or sensitive', other: 'Other', booking: 'Booking',
  trial: 'Trial lessons', refunds: 'Refunds', trial_booking: 'Trial booking',
};
export const topicLabel = (t: string | null) => (t ? TOPIC_LABEL[t] ?? sentence(t) : '—');

export const STAGE_LABEL: Record<string, string> = {
  intake: 'Received', normalise: 'Received', classify: 'Classified', draft: 'Draft written', clarify: 'Question written',
  verify: 'Claims verified', validate: 'Validated', review: 'Reviewed',
};

/** The one-line "why", from fixed vocabularies only. */
export function reasonFor(o: {
  outcome: Outcome; flags: string[]; topic: string | null; blockKinds: string[]; missingSlots: string[]; failedStage?: string | null; errorKind?: string | null;
}): string {
  switch (o.outcome) {
    case 'failed': return `Failed at ${o.failedStage ?? 'a stage'}${o.errorKind ? ` (${o.errorKind})` : ''}`;
    case 'blocked': return o.blockKinds.length ? (BLOCK_REASON_SENTENCE[o.blockKinds[0]!] ?? BLOCK_REASON_SENTENCE.other!) : 'Stopped by a check';
    case 'escalate': return o.flags.length ? `Safety: ${o.flags.map(f => flagLabel(f).toLowerCase()).join(', ')}` : `Topic: ${topicLabel(o.topic)}`;
    case 'clarify': return o.missingSlots.length ? `Asked for ${o.missingSlots.map(s => s.replace(/_/g, ' ')).join(', ')}` : 'Asked a clarifying question';
    case 'auto_send': return 'All claims supported';
    default: return 'Still being processed';
  }
}

import type { EnquiryRow, Outcome } from '../shared/api.js';
import { reasonFor, topicLabel } from '../shared/labels.js';

export interface DetailRecord {
  id: string; received_at: Date; status: string; category: string | null; action: string | null; language: string | null;
  confidence: string | null; safety_flags: string[]; missing_slots: string[]; review_status: string | null; is_test: boolean;
  block_kinds: string[]; cost_usd: string; outcome: Outcome; waiting_hours: string | null;
  failed_stage?: string | null; error_kind?: string | null;
}

const hoursText = (h: number) => (h < 1 ? 'under 1 h' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);

export function toRow(r: DetailRecord): EnquiryRow {
  const waiting = r.review_status === 'pending' && r.waiting_hours != null ? Number(r.waiting_hours) : null;
  const flags = r.safety_flags ?? [];
  return {
    id: r.id,
    ref: r.id.slice(0, 8),
    receivedAt: r.received_at.toISOString(),
    topic: topicLabel(r.category),
    outcome: r.outcome,
    reason: reasonFor({ outcome: r.outcome, flags, topic: r.category, blockKinds: r.block_kinds ?? [], missingSlots: r.missing_slots ?? [], failedStage: r.failed_stage, errorKind: r.error_kind }),
    flags,
    review: waiting != null ? `Waiting ${hoursText(waiting)}` : r.review_status === 'approved' ? 'Approved' : r.review_status === 'taken_over' ? 'Taken over' : '',
    waitingHours: waiting,
    costUsd: Number(r.cost_usd),
    isTest: r.is_test,
  };
}

// The columns toRow needs, from stats_enquiry_detail aliased `d`.
export const ROW_COLS = `d.id, d.received_at, d.status, d.category, d.action, d.language, d.confidence, d.safety_flags, d.missing_slots,
  d.review_status, d.is_test, d.block_kinds, d.cost_usd,
  ${`case when d.status = 'failed' then 'failed' when d.status = 'received' then 'in_progress' else coalesce(d.action, 'in_progress') end`} as outcome,
  extract(epoch from now() - d.received_at) / 3600 as waiting_hours`;

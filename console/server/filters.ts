import { z } from 'zod';
import type { Outcome, Traffic } from '../shared/api.js';

export const rangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(14),
  traffic: z.enum(['real', 'test', 'both']).default('both'),
});

// Fixed SQL fragments: user input never gets spliced into SQL, only chosen from these.
const TRAFFIC_SQL: Record<Traffic, string> = { real: 'not d.is_test', test: 'd.is_test', both: 'true' };
export const trafficSql = (t: Traffic) => TRAFFIC_SQL[t];

// Older rows (status 'new', before write-first intake) are never shown.
export const BASE_WHERE = (daysParam: string, t: Traffic) =>
  `d.status <> 'new' and d.day >= (now() at time zone 'Asia/Hong_Kong')::date - ${daysParam}::int and ${trafficSql(t)}`;

export const OUTCOME_SQL =
  `case when d.status = 'failed' then 'failed' when d.status = 'received' then 'in_progress' else coalesce(d.action, 'in_progress') end`;

export const OUTCOMES: Outcome[] = ['auto_send', 'clarify', 'escalate', 'blocked', 'failed', 'in_progress'];

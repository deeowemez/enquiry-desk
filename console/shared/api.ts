// Types shared by the server and the web app. Nothing here carries customer text: no name, email, subject,
// message or reply body. Reasons are built from fixed vocabularies (see labels.ts), never from free text.

export type Traffic = 'real' | 'test' | 'both';
export type Outcome = 'auto_send' | 'clarify' | 'escalate' | 'blocked' | 'failed' | 'in_progress';

export interface Range { days: number; traffic: Traffic }

export interface Me { login: string; name: string }

export interface EnquiryRow {
  id: string;
  ref: string;                    // first 8 characters of the id
  receivedAt: string;             // ISO
  topic: string;                  // category
  outcome: Outcome;
  reason: string;                 // plain-language, from fixed vocabularies
  flags: string[];                // safety flag names
  review: string;                 // "Waiting 3 h", "Approved", "Taken over" or ""
  waitingHours: number | null;
  costUsd: number;
  isTest: boolean;
}

export interface Overview {
  needsPerson: { count: number; oldestHours: number | null; safety: number };
  cleared: { pct: number; count: number; of: number };
  blockedOrFailed: { total: number; blocked: number; failed: number };
  health: { deadLetter: number; stuck: number; failures24h: number; lastProcessedAt: string | null };
  cost: { avgUsd: number; totalUsd: number };
  daily: { day: string; auto_send: number; clarify: number; escalate: number; blocked: number; failed: number }[];
  blockReasons: { kind: string; label: string; problems: number }[];
  oldestWaiting: EnquiryRow[];
}

export interface EnquiryPage { rows: EnquiryRow[]; total: number; page: number; pageSize: number }

export interface Stage { stage: string; status: string; attempt: number; model: string | null; costUsd: number; durationMs: number | null; errorKind: string | null }

export interface EnquiryDetail {
  row: EnquiryRow;
  language: string | null;
  confidence: number | null;
  missingSlots: string[];
  blockKinds: string[];
  hasDraft: boolean;
  sent: boolean;
  stages: Stage[];
  reviewUrl: string | null;       // the private review page; the token never leaves the server except inside this link
}

export interface Blocked {
  reasons: { kind: string; label: string; problems: number; replies: number }[];
  share: { pct: number; blocked: number; of: number };
  perDay: { day: string; blocked: number }[];
  unansweredByTopic: { topic: string; count: number }[];
}

export interface Cost {
  totalUsd: number; avgUsd: number; modelCalls: number;
  perDay: { day: string; costUsd: number }[];
  stages: { stage: string; model: string; calls: number; costUsd: number; sharePct: number }[];
}

export interface Health {
  deadLetter: number; stuck: number; failures24h: number; lastProcessedAt: string | null;
  recentFailures: { ref: string; at: string; stage: string; cause: string; status: 'replayed' | 'open' }[];
}

// ---- phase 2: facts, prompts, test runs and re-checks

export interface FactSetInfo {
  version: number; status: 'draft' | 'live' | 'archived'; note: string | null; createdBy: string | null; createdAt: string;
  basedOn: number | null; sourceVersion: number | null; gateRun: string | null; gatePassed: boolean | null; publishedAt: string | null; publishedBy: string | null;
}
export interface FactEntry { path: string; section: string; group: string; label: string; value: string | number | boolean; type: 'text' | 'number' | 'boolean'; topics: string[]; changed: 'added' | 'changed' | null; before?: string | number | boolean }
export interface FactDiff { path: string; kind: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown }
export interface FactsState {
  production: FactSetInfo | null;
  staging: FactSetInfo | null;
  draft: FactSetInfo | null;
  /** True once production enquiries record a facts_version, i.e. the live workflow reads the database. Until then, publishing changes nothing customers see. */
  workflowReadsDatabase: boolean;
  entries: FactEntry[];                 // the draft if there is one, otherwise the staging set
  entriesFrom: 'draft' | 'staging';
  diffVsStaging: FactDiff[];            // draft vs the staging live set
  diffStagingVsProduction: FactDiff[];  // what publishing would change
  canPublish: { ok: boolean; reason: string };
  history: FactSetInfo[];               // production versions, newest first
  topics: { id: string; name: string }[];
}
export type FactChange =
  | { op: 'set'; path: string; value: string | number | boolean }
  | { op: 'remove'; path: string }
  | { op: 'addItem'; path: string; value: Record<string, unknown> | string }
  | { op: 'removeItem'; path: string };

export interface PromptStage { stage: string; label: string; purpose: string; node: string; model: string; text: string }
export interface Prompts { source: string; stages: PromptStage[] }

export type JobKind = 'gate' | 'impact';
export interface Job {
  id: string; kind: JobKind; status: 'running' | 'done' | 'failed' | 'cancelled'; startedAt: string; finishedAt: string | null; startedBy: string;
  label: string; progress: { done: number; total: number }; factsVersion: number | null; message: string | null;
  gate?: { run: string; passed: boolean; checks: { pass: boolean; name: string; detail: string }[] };
  impact?: { before: Record<string, number>; after: Record<string, number>; changed: { ref: string; topic: string; before: string; after: string }[]; total: number };
}

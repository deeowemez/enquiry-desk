-- The fact table, versioned, in the database (phase 2 of the console). Apply to BOTH databases (production, then enquiry_staging).
--
-- One row per version. In each database the workflow reads the single `live` row, so:
--   enquiry_staging.live  = the candidate being tested (the staging workflow reads it)
--   production.live       = what customers' replies are grounded on (the live workflow reads it, once promoted)
-- A `draft` is an edit in progress (staging database only); `archived` rows are history and can be restored; `discarded` drafts are kept for the record.
-- The document keeps the exact shape the workflow already used (pricing, subjects, deadlines, lesson_schedule, ...).
create table if not exists fact_set (
  version        serial primary key,
  status         text        not null check (status in ('draft', 'live', 'archived', 'discarded')),   -- rows are never deleted: a thrown-away draft is 'discarded'
  doc            json        not null,    -- json, NOT jsonb: jsonb re-sorts keys, and the order the model sees the facts in matters
  note           text,
  created_by     text,
  created_at     timestamptz not null default now(),
  based_on       int,                      -- the version this one started from
  source_version int,                      -- on a published row: the staging version it was copied from
  gate_run       text,                     -- the scoring run that tested exactly this version on staging
  gate_passed    boolean,                  -- did that run pass compare.py's gate (safety, 0 invented, accuracy, cost)
  published_at   timestamptz,
  published_by   text
);
create unique index if not exists fact_set_one_live  on fact_set (status) where status = 'live';
create unique index if not exists fact_set_one_draft on fact_set (status) where status = 'draft';

-- Which facts version answered each enquiry (set by the workflow's `update enquiry`).
alter table enquiry add column if not exists facts_version int;

-- The console reads fact sets through this view (facts hold no customer data).
create or replace view stats_fact_set as
select version, status, doc, note, created_by, created_at, based_on, source_version, gate_run, gate_passed, published_at, published_by
from fact_set;

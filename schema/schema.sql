-- Project 01 — Enquiry Desk. Four tables; that's the whole thing.

create table enquiry (
  id            uuid primary key,
  source        text        not null check (source in ('form','email')),
  external_key  text        not null unique,     -- idempotency anchor
  received_at   timestamptz not null,
  from_email    text not null,
  subject       text,
  body          text        not null,
  category      text,
  confidence    numeric(3,2),
  language      text,
  safety_flags  jsonb       not null default '[]',
  missing_slots jsonb       not null default '[]',
  action        text        check (action in ('auto_send','clarify','escalate','blocked')),
  status        text        not null default 'received',  -- received -> processed | failed
  n8n_execution_id text,                                 -- links a row to its run; the error workflow finds it by this
  -- THE definition of scoring traffic (score.py sends test+<run>-<case>@example.com). Generated, so nothing can drift:
  -- the intake reads it back from `record received`, the stats_* views read it. Existing database:
  --   alter table enquiry add column is_test boolean generated always as (from_email ~* '^test\+[^@]*@example\.com$') stored;
  is_test       boolean generated always as (from_email ~* '^test\+[^@]*@example\.com$') stored,
  created_at    timestamptz not null default now()
);

create table reply (
  id          uuid primary key,
  enquiry_id  uuid        not null references enquiry(id),
  body        text        not null,
  grounded_on jsonb       not null default '[]',  -- which fact keys were used
  sent_at     timestamptz,
  blocked     boolean     not null default false,
  block_reason text
);

create table followup (
  id          uuid primary key,
  enquiry_id  uuid        not null references enquiry(id),
  due_at      timestamptz not null,
  sent_at     timestamptz,
  cancelled   boolean     not null default false
);

-- The table that makes the whole project demonstrable, and where your
-- portfolio numbers come from.
create table run_log (
  id          bigserial   primary key,
  enquiry_id  uuid,
  stage       text        not null,   -- classify | lookup | draft | validate | send
  status      text        not null,   -- ok | retry | failed
  attempt     int         not null default 1,
  model       text,
  cost_usd    numeric(10,6),
  duration_ms int,
  error       text,
  at          timestamptz not null default now()
);

create index on enquiry (status, received_at);
create index on enquiry (n8n_execution_id);
create index on followup (due_at) where sent_at is null and not cancelled;
create index on run_log (enquiry_id, at);

-- Dead-letter queue: enquiries whose run failed. test/replay.py re-posts these.
create or replace view dead_letter as
select e.id, e.received_at, e.from_email, e.subject, e.body, e.n8n_execution_id,
       (select l.stage || ': ' || coalesce(l.error, '') from run_log l
         where l.enquiry_id = e.id and l.status = 'failed' order by l.at desc limit 1) as last_error
from enquiry e
where e.status = 'failed';

-- Human review (session 4). escalate / blocked enquiries get review_status = 'pending' and a random
-- review_token; the review page (tailnet only) needs id + token. Approving a draft sets
-- reply.approved_at; sent_at stays null until a real outbound channel exists.
alter table enquiry add column if not exists review_status text
  check (review_status in ('pending', 'approved', 'taken_over'));
alter table enquiry add column if not exists review_token text;
alter table enquiry add column if not exists reviewed_at timestamptz;
alter table reply add column if not exists approved_at timestamptz;

-- Outbound (2026-10-17): an approved reply becomes a DRAFT in the business Gmail inbox, never an auto-send.
-- drafted_at / gmail_draft_id record the draft; draft_error records why one could not be created.
-- sent_at stays null: a person presses Send in Gmail.
alter table reply add column if not exists drafted_at timestamptz;
alter table reply add column if not exists gmail_draft_id text;
alter table reply add column if not exists draft_error text;
create index if not exists enquiry_review_pending_idx on enquiry (received_at) where review_status = 'pending';

-- Dashboard views. Every dashboard number is defined here, once, so Grafana / React / the README all
-- read the same answer. No view exposes from_email, subject or body: a dashboard user can be granted
-- these views only, and can't leak customer data even by mistake.
--   day      = calendar day in Hong Kong time (the customers' day, UTC+8)
--   is_test  = score.py traffic, the generated column enquiry.is_test (test+…@example.com); filter it in or out per panel
--   legacy   = status 'new' rows from before write-first intake (session 1–2); kept, but not "processed"

-- One row per enquiry, with its cost. The base the other views build on.
create or replace view stats_enquiry as
select e.id,
       e.received_at,
       (e.received_at at time zone 'Asia/Hong_Kong')::date        as day,
       e.status,
       e.category,
       e.action,
       e.language,
       jsonb_array_length(e.safety_flags - 'none') > 0            as has_safety_flag,
       e.review_status,
       e.is_test                                                   as is_test,
       coalesce(c.cost_usd, 0)                                     as cost_usd,
       coalesce(c.model_calls, 0)                                  as model_calls
from enquiry e
left join (select enquiry_id, sum(cost_usd) as cost_usd,
                  count(*) filter (where model is not null) as model_calls
             from run_log group by enquiry_id) c on c.enquiry_id = e.id;

-- Enquiries per day by outcome. action is null until a run finishes (received / failed rows).
create or replace view stats_daily as
select day, is_test, status, coalesce(action, '—') as action, count(*) as enquiries
from stats_enquiry
group by 1, 2, 3, 4;

-- Spend per day. avg_cost_usd is over processed enquiries only (failed runs are partial).
create or replace view stats_cost as
select day, is_test,
       count(*) filter (where status = 'processed')                         as processed,
       round(sum(cost_usd), 6)                                               as total_cost_usd,
       round(avg(cost_usd) filter (where status = 'processed'), 6)          as avg_cost_usd
from stats_enquiry
group by 1, 2;

-- Waiting for a person, oldest first.
create or replace view stats_pending_reviews as
select id, category, action, is_test, received_at, now() - received_at as waiting
from stats_enquiry
where review_status = 'pending'
order by received_at;

-- What stopped a reply, by kind. block_reason holds every problem joined with '; ', so it is split
-- into one row per problem and bucketed by its wording (set in `validate claims` / gate 2). Split only
-- where a new problem starts: quoted evidence can itself contain '; '.
create or replace view stats_block_reasons as
select kind, count(*) as problems, count(distinct enquiry_id) as replies
from (select r.enquiry_id,
             case
               when p like 'Not answerable from facts%' then 'gate 2: facts can''t answer'
               when p like 'price %'                    then 'invented price'
               when p like 'percentage %'               then 'invented percentage'
               when p like 'time %'                     then 'time not in facts'
               when p like 'date %'                     then 'date not in facts / unverified'
               when p like 'says %unavailable%'         then 'available subject called unavailable'
               when p like 'unsupported claim%'         then 'verifier: unsupported claim'
               when p like 'claim check returned%'      then 'verifier: no result'
               else 'other'
             end as kind
        from reply r,
             regexp_split_to_table(r.block_reason,
               '; (?=Not answerable|price |percentage |time |date |says |unsupported claim|claim check)') as p
       where r.blocked and coalesce(r.block_reason, '') <> '') x
group by 1
order by 2 desc;

-- Health in one row. 'stuck' = still 'received' 10+ minutes on: the run died without the errors
-- workflow marking it failed (e.g. a manual editor run - the Error Trigger only fires in production).
-- validate/failed rows in run_log are BLOCKED replies (working as designed), not system failures.
create or replace view stats_health as
select (select count(*) from enquiry where status = 'failed')                               as dead_letter,
       (select count(*) from enquiry
         where status = 'received' and received_at < now() - interval '10 minutes')         as stuck,
       (select count(*) from enquiry where review_status = 'pending')                        as pending_reviews,
       (select count(*) from run_log
         where status = 'failed' and stage <> 'validate' and at > now() - interval '24 hours') as failures_24h,
       (select max(received_at) from enquiry where status = 'processed')                     as last_processed_at;

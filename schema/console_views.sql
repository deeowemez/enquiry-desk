-- Views for the staff console (console/). Structured fields only: no from_email, subject, body or reply text, and
-- run_log.error is bucketed, never exposed raw (it can carry free text). The console's login (schema/console_role.sql)
-- can SELECT these and nothing else. Apply to BOTH databases (production, then enquiry_staging).
--
-- stats_enquiry_detail also carries review_token (the secret in a review link), so it is for the console only:
-- do NOT grant it to any other login.

-- One row per problem that stopped a reply, bucketed by its wording (the single definition; stats_block_reasons counts these).
create or replace view stats_block_problem as
select r.enquiry_id,
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
 where r.blocked and coalesce(r.block_reason, '') <> '';

create or replace view stats_block_reasons as
select kind, count(*) as problems, count(distinct enquiry_id) as replies
from stats_block_problem
group by 1
order by 2 desc;

-- Per-stage run record. error_kind is a bucket, never the raw error text.
create or replace view stats_run_stage as
select enquiry_id, stage, status, attempt, model, cost_usd, duration_ms, at,
       case
         when error is null or error = ''                  then null
         when error ~* 'timed? ?out|timeout|ETIMEDOUT'     then 'timeout'
         when error ~* '\m429\M|throttl|rate'              then 'rate limit'
         when error ~* '\m50[0-9]\M'                       then 'model server error'
         when error ~* 'Operation not allowed|\m400\M'     then 'request rejected'
         else 'other'
       end as error_kind
from run_log;

-- One row per enquiry for the console: structured fields, outcome, review and draft state, cost, reason buckets.
create or replace view stats_enquiry_detail as
select e.id,
       e.received_at,
       (e.received_at at time zone 'Asia/Hong_Kong')::date as day,
       e.status, e.category, e.action, e.language, e.confidence,
       (e.safety_flags - 'none')   as safety_flags,       -- names from the classifier's fixed list
       e.missing_slots,                                    -- slot names from a fixed list
       e.review_status, e.reviewed_at, e.is_test,
       e.review_token,
       coalesce(r.blocked, false)                          as blocked,
       r.drafted_at,
       (r.gmail_draft_id is not null)                      as has_draft,
       (r.sent_at is not null)                             as sent,
       coalesce(k.kinds, '{}')                             as block_kinds,
       coalesce(c.cost_usd, 0)                             as cost_usd,
       coalesce(c.model_calls, 0)                          as model_calls,
       e.facts_version                                      -- which fact_set version answered it (null before the workflow read the database)
from enquiry e
left join lateral (select blocked, drafted_at, gmail_draft_id, sent_at from reply
                    where enquiry_id = e.id order by approved_at desc nulls last limit 1) r on true
left join (select enquiry_id, array_agg(distinct kind) as kinds from stats_block_problem group by 1) k on k.enquiry_id = e.id
left join (select enquiry_id, sum(cost_usd) as cost_usd, count(*) filter (where model is not null) as model_calls
             from run_log group by enquiry_id) c on c.enquiry_id = e.id;

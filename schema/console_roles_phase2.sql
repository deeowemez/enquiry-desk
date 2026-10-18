-- Extra logins for console phase 2. Run in EACH database after schema/facts.sql and schema/console_views.sql:
--   docker exec -i <postgres> psql -U <user> -d <db> -v facts_pw="'..'" -v staging_pw="'..'" -v recheck_pw="'..'" -f - < schema/console_roles_phase2.sql
-- Roles are cluster-wide, so the passwords are set once; the grants are per database.
do $$ begin
  if not exists (select from pg_roles where rolname = 'console_facts')   then create role console_facts   login; end if;
  if not exists (select from pg_roles where rolname = 'console_staging') then create role console_staging login; end if;
  if not exists (select from pg_roles where rolname = 'console_recheck') then create role console_recheck login; end if;
end $$;
alter role console_facts   password :facts_pw;
alter role console_staging password :staging_pw;
alter role console_recheck password :recheck_pw;
alter role console_facts   set default_transaction_read_only = off;
alter role console_staging set default_transaction_read_only = on;
alter role console_recheck set default_transaction_read_only = on;

-- console_ro: may also read fact sets (no customer data in them)
grant select on stats_fact_set to console_ro;

-- console_facts: the ONLY write path of the console. fact_set and nothing else.
revoke all on all tables in schema public from console_facts;
grant usage on schema public to console_facts;
grant select, insert, update on fact_set to console_facts;
grant usage, select on sequence fact_set_version_seq to console_facts;

-- console_staging: read everything, but ONLY meaningful in enquiry_staging, which holds synthetic data (repo rule 2).
-- Used by the test runner (score.py reads rows back). Granted in the staging database only.
-- console_recheck: reads just what a re-check must re-send; never exposed by the API. Granted in production only.
revoke all on all tables in schema public from console_staging, console_recheck;
grant usage on schema public to console_staging, console_recheck;

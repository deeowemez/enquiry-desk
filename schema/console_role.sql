-- Read-only login for the staff console. SELECT on the stats_* views only; nothing else.
--   docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n -v pw="'<password>'" -f - < schema/console_role.sql
do $$ begin
  if not exists (select from pg_roles where rolname = 'console_ro') then
    create role console_ro login;
  end if;
end $$;
alter role console_ro password :pw;
revoke all on all tables in schema public from console_ro;
grant usage on schema public to console_ro;
grant select on stats_enquiry, stats_enquiry_detail, stats_run_stage, stats_block_problem, stats_block_reasons,
                stats_daily, stats_cost, stats_pending_reviews, stats_health to console_ro;
alter role console_ro set default_transaction_read_only = on;

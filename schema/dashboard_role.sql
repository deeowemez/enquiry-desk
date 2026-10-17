-- Read-only login for the dashboard. It can SELECT the stats_* views and nothing else, so even a
-- compromised Grafana can't read enquiry, reply or run_log (and the views carry no email, subject or body).
-- Run once as the database owner:
--   docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n -v pw="'<password>'" -f - < schema/dashboard_role.sql
-- The views run with their owner's rights, so granting the views is enough.
do $$ begin
  if not exists (select from pg_roles where rolname = 'grafana_ro') then
    create role grafana_ro login;
  end if;
end $$;
alter role grafana_ro password :pw;
revoke all on all tables in schema public from grafana_ro;
grant usage on schema public to grafana_ro;
grant select on stats_enquiry, stats_daily, stats_cost, stats_pending_reviews,
                stats_block_reasons, stats_health to grafana_ro;
alter role grafana_ro set default_transaction_read_only = on;

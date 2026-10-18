import pg from 'pg';

// Five logins, each with the least it needs (see schema/*.sql):
//   ro        console_ro       production  SELECT on the stats_* views                 (everything the screens show)
//   factsProd console_facts    production  select/insert/update on fact_set ONLY        (publishing)
//   factsStg  console_facts    staging     select/insert/update on fact_set ONLY        (drafts, apply)
//   staging   console_staging  staging     SELECT on the synthetic staging tables       (test runs read rows back)
//   recheck   console_recheck  production  SELECT (id, subject, body, category, ...)    (re-send an enquiry to staging; never returned by the API)
const make = (user: string, password: string | undefined, database: string, max = 2) => new pg.Pool({
  host: process.env.CONSOLE_DB_HOST ?? 'postgres', port: Number(process.env.CONSOLE_DB_PORT ?? 5432),
  user, password, database, max, idleTimeoutMillis: 30_000,
});
const PROD = process.env.CONSOLE_DB_NAME ?? 'n8n';
const STG = process.env.CONSOLE_STAGING_DB ?? 'enquiry_staging';

export const factsProd = make('console_facts', process.env.CONSOLE_FACTS_PASSWORD, PROD);
export const factsStg = make('console_facts', process.env.CONSOLE_FACTS_PASSWORD, STG);
export const stagingRead = make('console_staging', process.env.CONSOLE_STAGING_PASSWORD, STG);
export const recheckRead = make('console_recheck', process.env.CONSOLE_RECHECK_PASSWORD, PROD);
let closed = false;
export const closeAll = async () => { if (closed) return; closed = true; await Promise.all([factsProd.end(), factsStg.end(), stagingRead.end(), recheckRead.end()]); };   // safe to call twice

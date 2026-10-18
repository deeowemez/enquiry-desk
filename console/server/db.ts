import pg from 'pg';

// Read-only login (schema/console_role.sql): SELECT on the stats_* views, nothing else.
export const pool = new pg.Pool({
  host: process.env.CONSOLE_DB_HOST ?? 'postgres',
  port: Number(process.env.CONSOLE_DB_PORT ?? 5432),
  database: process.env.CONSOLE_DB_NAME ?? 'enquiry',
  user: process.env.CONSOLE_DB_USER ?? 'console_ro',
  password: process.env.CONSOLE_DB_PASSWORD,
  max: 4,
  idleTimeoutMillis: 30_000,
});

export async function rows<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(sql, params)).rows;
}

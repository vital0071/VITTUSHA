import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl: config.pgssl ? { rejectUnauthorized: false } : false
    })
  : null;

export function isDatabaseEnabled() {
  return Boolean(pool);
}

export async function query(text, params) {
  if (!pool) {
    throw new Error('PostgreSQL is disabled because DATABASE_URL is not configured.');
  }
  return pool.query(text, params);
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
}

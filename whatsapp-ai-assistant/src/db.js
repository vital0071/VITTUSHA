import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgssl ? { rejectUnauthorized: false } : false
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function closeDatabase() {
  await pool.end();
}

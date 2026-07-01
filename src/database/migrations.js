import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query as defaultQuery } from '../db.js';
import { logger as defaultLogger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', '..', 'sql', 'migrations');
const schemaPath = join(__dirname, '..', '..', 'sql', 'schema.sql');

export async function runDatabaseMigrations({
  query = defaultQuery,
  logger = defaultLogger,
  directory = migrationsDir,
  schema = schemaPath
} = {}) {
  const schemaSql = await readFile(schema, 'utf8');
  logger.info('database_schema_started', { file: 'schema.sql' });
  await query(schemaSql);
  logger.info('database_schema_finished', { file: 'schema.sql' });

  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = await readFile(join(directory, file), 'utf8');
    logger.info('database_migration_started', { file });
    await query(sql);
    logger.info('database_migration_finished', { file });
  }

  return files;
}

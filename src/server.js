import { createApp } from './app.js';
import { assertRequiredEnv, config } from './config.js';
import { closeDatabase } from './db.js';
import { logger } from './logger.js';

assertRequiredEnv();

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info('Vittusha Telegram AI server listening', { port: config.port });
});

async function shutdown(signal) {
  logger.info('Shutting down server', { signal });
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

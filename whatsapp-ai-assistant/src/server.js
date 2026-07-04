import { createApp } from './app.js';
import { assertRequiredEnv, config } from './config.js';
import { closeDatabase } from './db.js';
import { logger } from './logger.js';
import { startDailyCheckInScheduler } from './scheduler/checkin.js';

assertRequiredEnv();

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info('WhatsApp AI assistant listening', { port: config.port });
});
const checkInTimer = startDailyCheckInScheduler();

async function shutdown(signal) {
  logger.info('Shutting down server', { signal });
  if (checkInTimer) {
    clearTimeout(checkInTimer);
  }
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

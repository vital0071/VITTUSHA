import { config } from '../config.js';
import { logger } from '../logger.js';
import { generateDailyCheckIn } from '../proactive-engine.js';
import { sendWhatsAppTextMessage } from '../channels/whatsapp.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startDailyCheckInScheduler(dependencies = {}) {
  const deps = {
    config,
    logger,
    generateDailyCheckIn,
    sendWhatsAppTextMessage,
    setTimeout,
    ...dependencies
  };

  if (!deps.config.proactive.enableCheckIn) {
    deps.logger.info('Daily proactive check-in disabled');
    return null;
  }

  const scheduleNext = () => {
    const delay = getDelayUntilCheckIn(deps.config.proactive.checkInTime);
    return deps.setTimeout(async () => {
      try {
        const text = await deps.generateDailyCheckIn({
          userId: deps.config.approvedPhoneNumber,
          persist: true
        });
        await deps.sendWhatsAppTextMessage({
          to: deps.config.approvedPhoneNumber,
          text
        });
      } catch (error) {
        deps.logger.error('Daily proactive check-in failed', { error: error.message });
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  return scheduleNext();
}

export function getDelayUntilCheckIn(checkInTime = '08:00') {
  const [hourText, minuteText] = checkInTime.split(':');
  const now = new Date();
  const next = new Date(now);
  next.setHours(Number(hourText), Number(minuteText), 0, 0);

  if (next <= now) {
    next.setTime(next.getTime() + ONE_DAY_MS);
  }

  return next.getTime() - now.getTime();
}

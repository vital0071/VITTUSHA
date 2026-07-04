import { config } from '../config.js';
import { logger } from '../logger.js';
import { generateDailyCheckIn } from '../proactive-engine.js';
import { sendWhatsAppTextMessage } from '../channels/whatsapp.js';
import { sendTelegramTextMessage } from '../channels/telegram.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startDailyCheckInScheduler(dependencies = {}) {
  const deps = {
    config,
    logger,
    generateDailyCheckIn,
    sendWhatsAppTextMessage,
    sendTelegramTextMessage,
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
        const target = resolveCheckInTarget(deps.config);
        if (!target) {
          deps.logger.warn('Daily proactive check-in enabled but no channel is configured');
          return;
        }
        const text = await deps.generateDailyCheckIn({
          userId: target.userId,
          persist: true
        });
        if (target.channel === 'telegram') {
          await deps.sendTelegramTextMessage({ chatId: target.chatId, text });
        } else {
          await deps.sendWhatsAppTextMessage({ to: target.phoneNumber, text });
        }
      } catch (error) {
        deps.logger.error('Daily proactive check-in failed', { error: error.message });
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  return scheduleNext();
}

export function resolveCheckInTarget(appConfig = config) {
  if (appConfig.telegram?.botToken && appConfig.telegram?.allowedChatId) {
    return {
      channel: 'telegram',
      userId: appConfig.telegram.allowedChatId,
      chatId: appConfig.telegram.allowedChatId
    };
  }

  if (appConfig.meta?.accessToken && appConfig.meta?.phoneNumberId && appConfig.approvedPhoneNumber) {
    return {
      channel: 'whatsapp',
      userId: appConfig.approvedPhoneNumber,
      phoneNumber: appConfig.approvedPhoneNumber
    };
  }

  return null;
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

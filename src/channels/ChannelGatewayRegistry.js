import { TelegramGateway } from './telegram/TelegramGateway.js';

export function createChannelGatewayRegistry(dependencies = {}) {
  const telegramGateway = dependencies.telegramGateway ?? new TelegramGateway(dependencies);

  return {
    get(channel) {
      if (channel === 'telegram') {
        return telegramGateway;
      }

      return null;
    }
  };
}

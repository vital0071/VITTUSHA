import { MetaWhatsAppCloudGateway } from './MetaWhatsAppCloudGateway.js';
import { TelegramGateway } from './telegram/TelegramGateway.js';

export function createChannelGatewayRegistry(dependencies = {}) {
  const whatsappGateway = dependencies.whatsappGateway ?? new MetaWhatsAppCloudGateway(dependencies);
  const telegramGateway = dependencies.telegramGateway ?? new TelegramGateway(dependencies);

  return {
    get(channel) {
      if (channel === 'whatsapp') {
        return whatsappGateway;
      }

      if (channel === 'telegram') {
        return telegramGateway;
      }

      return null;
    }
  };
}

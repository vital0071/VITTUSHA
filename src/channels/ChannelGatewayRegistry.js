import { MetaWhatsAppCloudGateway } from './MetaWhatsAppCloudGateway.js';

export function createChannelGatewayRegistry(dependencies = {}) {
  const whatsappGateway = dependencies.whatsappGateway ?? new MetaWhatsAppCloudGateway(dependencies);

  return {
    get(channel) {
      if (channel === 'whatsapp') {
        return whatsappGateway;
      }

      return null;
    }
  };
}

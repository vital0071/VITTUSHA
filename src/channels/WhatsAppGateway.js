import { ChannelGateway } from './ChannelGateway.js';

// Placeholder only. The Sprint 1 server uses a dedicated compatibility gateway
// for the current Meta webhook so this future adapter can evolve without
// becoming a dependency of the Brain or the HTTP server.
export class WhatsAppGateway extends ChannelGateway {}

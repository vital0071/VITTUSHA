export class ChannelGateway {
  async receive() {
    throw new Error('ChannelGateway.receive() must be implemented by a channel adapter.');
  }

  async send() {
    throw new Error('ChannelGateway.send() must be implemented by a channel adapter.');
  }

  async typing() {
    throw new Error('ChannelGateway.typing() must be implemented by a channel adapter.');
  }

  async acknowledge() {
    throw new Error('ChannelGateway.acknowledge() must be implemented by a channel adapter.');
  }
}

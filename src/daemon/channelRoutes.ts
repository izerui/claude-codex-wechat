import type { FastifyInstance } from 'fastify';
import type { BridgeEventHub } from './events';
import { mapWechatInboundToChannelMessage } from '../channels/wechat-clawbot/messageMapping';
import type { WechatClawbotInboundPayload } from '../channels/wechat-clawbot/types';
import type { MessageRouter } from '../session/messageRouter';
import type { PairingRepository } from '../storage/pairingRepository';
import type { UserRepository } from '../storage/userRepository';

export function registerChannelRoutes(input: {
  app: FastifyInstance;
  users: UserRepository;
  pairings: PairingRepository;
  events: BridgeEventHub;
  messageRouter?: MessageRouter;
}): void {
  input.app.post<{ Body: WechatClawbotInboundPayload }>('/api/channel/wechat/inbound', async (request, reply) => {
    const message = mapWechatInboundToChannelMessage(request.body);
    input.events.emit({ type: 'status', message: `wechat_inbound_received:${message.chatId}` });

    const user = input.users.findByPlatformUser('wechat-clawbot', message.user.id);
    if (!user) {
      const existing = input.pairings.listPending().find((pairing) => pairing.platformUserId === message.user.id && pairing.chatId === message.chatId);
      const pairing = existing ?? input.pairings.createPending({
        platformUserId: message.user.id,
        chatId: message.chatId,
        displayName: message.user.displayName,
        ttlMs: 10 * 60 * 1000,
      });
      return reply.code(202).send({ ok: true, status: 'pairing_required', code: pairing.code });
    }

    await input.messageRouter?.handleMessage(message);
    return reply.send({ ok: true, status: 'accepted' });
  });
}

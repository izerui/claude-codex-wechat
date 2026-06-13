import type { ChannelIncomingMessage } from './types';
import { PRIMARY_WEIXIN_PLATFORM } from './platforms';
import type { BridgeEventHub } from '../daemon/events';
import type { PairingRepository } from '../storage/pairingRepository';

export function ensurePairingForMessage(
  pairings: PairingRepository,
  events: BridgeEventHub,
  message: ChannelIncomingMessage,
) {
  const existing = pairings.listPending().find((pairing) => pairing.platformUserId === message.user.id && pairing.chatId === message.chatId);
  const pairing = existing ?? pairings.createPending({
    platformUserId: message.user.id,
    chatId: message.chatId,
    displayName: message.user.displayName,
    ttlMs: 10 * 60 * 1000,
  });
  if (!existing) {
    events.emit({
      type: 'channel.pairing-requested',
      pairing: {
        code: pairing.code,
        platformUserId: pairing.platformUserId,
        platformType: PRIMARY_WEIXIN_PLATFORM,
        display_name: pairing.displayName,
        requestedAt: pairing.requestedAt,
        expiresAt: pairing.expiresAt,
      },
    });
  }
  return pairing;
}

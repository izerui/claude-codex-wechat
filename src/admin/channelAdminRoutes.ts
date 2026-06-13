import type { FastifyInstance } from 'fastify';
import type { PairingRepository } from '../storage/pairingRepository';
import type { UserRepository } from '../storage/userRepository';

export function registerChannelAdminRoutes(input: {
  app: FastifyInstance;
  pairings: PairingRepository;
  users: UserRepository;
}): void {
  input.app.get('/api/channel/pairings', async () => input.pairings.listPending());

  input.app.post<{ Params: { code: string } }>('/api/channel/pairings/:code/approve', async (request, reply) => {
    const pairing = input.pairings.findByCode(request.params.code);
    if (!pairing || pairing.status !== 'pending') return reply.code(400).send({ ok: false, error: 'pairing_not_pending' });
    const result = input.pairings.approve(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    if (!input.users.findByPlatformUser('wechat-clawbot', pairing.platformUserId)) {
      input.users.createUser({
        platform: 'wechat-clawbot',
        platformUserId: pairing.platformUserId,
        displayName: pairing.displayName,
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: process.cwd(),
      });
    }
    return result;
  });

  input.app.post<{ Params: { code: string } }>('/api/channel/pairings/:code/reject', async (request, reply) => {
    const result = input.pairings.reject(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  input.app.get('/api/channel/users', async () => input.users.listUsers());
}

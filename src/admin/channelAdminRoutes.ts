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
    const result = input.pairings.approve(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  input.app.post<{ Params: { code: string } }>('/api/channel/pairings/:code/reject', async (request, reply) => {
    const result = input.pairings.reject(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  input.app.get('/api/channel/users', async () => input.users.listUsers());
}

import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { PermissionRouter } from '../permissions/permissionRouter';
import { SessionManager } from '../session/sessionManager';
import { BridgeEventHub } from './events';

export function createDaemonServer() {
  const app = Fastify({ logger: true });
  const events = new BridgeEventHub();
  const sessions = new SessionManager({ defaultCwd: process.cwd(), defaultProviderId: 'claude-code' });
  const permissions = new PermissionRouter();

  void app.register(websocket);

  app.get('/api/status', async () => ({
    ok: true,
    sessions: sessions.listSessions(),
    permissions: permissions.getPendingRequests(),
  }));

  app.post<{ Body: { requestId: string; userId: string; decision: 'approve' | 'deny' | 'abort' } }>('/api/permissions/decide', async (request, reply) => {
    const result = permissions.decide(request.body);
    if (!result.ok) return reply.code(400).send(result);
    events.emit({ type: 'permission_decided', requestId: request.body.requestId, decision: request.body.decision });
    return result;
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const unsubscribe = events.subscribe((event) => socket.send(JSON.stringify(event)));
    socket.on('close', unsubscribe);
  });

  return { app, sessions, permissions, events };
}

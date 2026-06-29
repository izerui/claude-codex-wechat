import { randomBytes } from 'node:crypto';

export function createDomainRegistry(input) {
  const tokenToConnection = new Map();
  const connectionToAllocation = new Map();

  function generateLabel() {
    return randomBytes(8).toString('hex').slice(0, 12);
  }

  return {
    allocate(connectionId, metadata = {}) {
      let token = generateLabel();
      while (tokenToConnection.has(token)) {
        token = generateLabel();
      }
      const publicBaseUrl = String(metadata.publicBaseUrl ?? '').trim().replace(/\/+$/, '');
      const allocation = {
        connectionId,
        token,
        ...(publicBaseUrl ? { publicUrl: `${publicBaseUrl}/${token}` } : {}),
      };
      tokenToConnection.set(token, connectionId);
      connectionToAllocation.set(connectionId, allocation);
      return allocation;
    },
    lookupByToken(token) {
      return tokenToConnection.get(token) ?? null;
    },
    lookupAllocation(connectionId) {
      return connectionToAllocation.get(connectionId) ?? null;
    },
    release(connectionId) {
      const allocation = connectionToAllocation.get(connectionId);
      if (!allocation) return;
      tokenToConnection.delete(allocation.token);
      connectionToAllocation.delete(connectionId);
    },
  };
}

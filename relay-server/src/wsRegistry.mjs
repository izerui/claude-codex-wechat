export function createWsRegistry() {
  const connections = new Map();
  const authTokenToConnection = new Map();
  return {
    set(connectionId, record) {
      connections.set(connectionId, record);
      if (typeof record?.authToken === 'string' && record.authToken) {
        authTokenToConnection.set(record.authToken, connectionId);
      }
    },
    get(connectionId) {
      return connections.get(connectionId) ?? null;
    },
    getByAuthToken(authToken) {
      const connectionId = authTokenToConnection.get(authToken);
      if (!connectionId) return null;
      return connections.get(connectionId) ?? null;
    },
    lookupConnectionIdByAuthToken(authToken) {
      return authTokenToConnection.get(authToken) ?? null;
    },
    delete(connectionId) {
      const record = connections.get(connectionId);
      if (record?.authToken && authTokenToConnection.get(record.authToken) === connectionId) {
        authTokenToConnection.delete(record.authToken);
      }
      connections.delete(connectionId);
    },
    entries() {
      return connections.entries();
    },
    values() {
      return connections.values();
    },
  };
}

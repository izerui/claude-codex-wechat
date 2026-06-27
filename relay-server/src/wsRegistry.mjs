export function createWsRegistry() {
  const connections = new Map();
  return {
    set(connectionId, socket) {
      connections.set(connectionId, socket);
    },
    get(connectionId) {
      return connections.get(connectionId) ?? null;
    },
    delete(connectionId) {
      connections.delete(connectionId);
    },
    entries() {
      return connections.entries();
    },
  };
}

export function createWsRegistry() {
  const connections = new Map();
  return {
    set(connectionId, record) {
      connections.set(connectionId, record);
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
    values() {
      return connections.values();
    },
  };
}

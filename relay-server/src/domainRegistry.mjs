import { createHash, randomBytes } from 'node:crypto';

export function createDomainRegistry(input) {
  const tokenToConnection = new Map();
  const connectionToAllocation = new Map();

  // 按 authToken 确定性派生后缀：同一客户端（authToken 持久化在其 config 中）
  // 跨重启 / 跨服务端重启都得到相同的公网地址后缀。authToken 是密钥，
  // 取其 sha256 指纹前 12 位作公开后缀，既稳定又不泄露密钥。
  function deterministicLabel(authToken) {
    return createHash('sha256').update(String(authToken)).digest('hex').slice(0, 12);
  }

  function randomLabel() {
    return randomBytes(8).toString('hex').slice(0, 12);
  }

  return {
    allocate(connectionId, metadata = {}) {
      let token = metadata.authToken ? deterministicLabel(metadata.authToken) : randomLabel();
      // 仅当 token 被【其它】连接占用时才退避到随机值（确定性派生几乎不会撞，
      // 且同一 authToken 重连前其旧连接应已 release）。
      while (tokenToConnection.has(token) && tokenToConnection.get(token) !== connectionId) {
        token = randomLabel();
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

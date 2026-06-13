import { useCallback, useEffect, useState } from 'react';
import {
  approvePairing,
  fetchAuthorizedUsers,
  fetchPairings,
  rejectPairing,
  revokeAuthorizedUser,
  type AuthorizedUserView,
  type PairingView,
} from './apiClient';

export function WeChatPanel() {
  const [pairings, setPairings] = useState<PairingView[]>([]);
  const [users, setUsers] = useState<AuthorizedUserView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextPairings, nextUsers] = await Promise.all([fetchPairings(), fetchAuthorizedUsers()]);
      setPairings(nextPairings);
      setUsers(nextUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = async (code: string, decision: 'approve' | 'reject') => {
    if (decision === 'approve') await approvePairing(code);
    else await rejectPairing(code);
    await refresh();
  };

  const revoke = async (userId: string) => {
    await revokeAuthorizedUser(userId);
    await refresh();
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h2>WeChat channel</h2>
      <button type="button" onClick={() => void refresh()}>Refresh</button>
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}

      <h3>Pending pairings</h3>
      {pairings.length === 0 ? <p>No pending pairings.</p> : (
        <ul>
          {pairings.map((pairing) => (
            <li key={pairing.code} style={{ marginBottom: 12 }}>
              <strong>{pairing.displayName ?? pairing.platformUserId}</strong>
              <div>Chat: {pairing.chatId}</div>
              <div>Code: {pairing.code}</div>
              <button type="button" onClick={() => void decide(pairing.code, 'approve')}>Approve</button>{' '}
              <button type="button" onClick={() => void decide(pairing.code, 'reject')}>Reject</button>
            </li>
          ))}
        </ul>
      )}

      <h3>Authorized users</h3>
      {users.length === 0 ? <p>No authorized users.</p> : (
        <ul>
          {users.map((user) => (
            <li key={user.id} style={{ marginBottom: 12 }}>
              <strong>{user.displayName ?? user.platformUserId}</strong> · {user.defaultProvider} · {user.defaultCwd}{' '}
              <button type="button" onClick={() => void revoke(user.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

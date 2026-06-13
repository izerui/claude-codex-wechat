export type PairingView = {
  code: string;
  platformUserId: string;
  chatId: string;
  displayName?: string;
  requestedAt: number;
  expiresAt: number;
  status: string;
};

export type AuthorizedUserView = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: string;
  defaultProvider: string;
  defaultCwd: string;
  createdAt: number;
  lastActiveAt?: number;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`${path}_failed:${response.status}`);
  return await response.json() as T;
}

export async function fetchStatus(): Promise<unknown> {
  return await requestJson('/api/status');
}

export async function fetchPairings(): Promise<PairingView[]> {
  return await requestJson('/api/channel/pairings');
}

export async function approvePairing(code: string): Promise<void> {
  await requestJson(`/api/channel/pairings/${encodeURIComponent(code)}/approve`, { method: 'POST' });
}

export async function rejectPairing(code: string): Promise<void> {
  await requestJson(`/api/channel/pairings/${encodeURIComponent(code)}/reject`, { method: 'POST' });
}

export async function fetchAuthorizedUsers(): Promise<AuthorizedUserView[]> {
  return await requestJson('/api/channel/users');
}

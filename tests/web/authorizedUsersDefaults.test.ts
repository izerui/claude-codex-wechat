import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthorizedUsers } from '../../src/web/apiClient';

// 授权用户列表里的 defaultProvider / defaultCwd 曾是前端写死的（'claude-code' 与
// '/tmp/project'），既忽略了用户的真实配置，在 Windows 上还是个不存在的目录。
// 后端 /api/channel/state 本来就返回真实的 settings，直接用它。
function mockState(settings: { defaultProvider: string; defaultWorkspace: string }) {
  return vi.fn(async (url: unknown) => {
    if (String(url).includes('/api/channel/state')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          activeUser: {
            id: 'user_1',
            platform: 'weixin',
            platformUserId: 'wx_1',
            role: 'user',
            createdAt: 1,
            updatedAt: 2,
          },
          settings,
        }),
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchAuthorizedUsers', () => {
  it('takes the working directory from the backend settings', async () => {
    vi.stubGlobal('fetch', mockState({ defaultProvider: 'codex', defaultWorkspace: '/Users/me/work' }));

    const users = await fetchAuthorizedUsers();

    expect(users[0].defaultCwd).toBe('/Users/me/work');
    expect(users[0].defaultProvider).toBe('codex');
  });

  it('carries a windows workspace through unchanged', async () => {
    vi.stubGlobal('fetch', mockState({ defaultProvider: 'claude-code', defaultWorkspace: 'C:\\Users\\me\\project' }));

    const users = await fetchAuthorizedUsers();

    expect(users[0].defaultCwd).toBe('C:\\Users\\me\\project');
    expect(users[0].defaultCwd).not.toContain('/tmp');
  });

  it('returns an empty list when there is no active user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ activeUser: null, settings: { defaultProvider: 'claude-code', defaultWorkspace: '/x' } }),
    }) as unknown as Response));

    expect(await fetchAuthorizedUsers()).toEqual([]);
  });
});

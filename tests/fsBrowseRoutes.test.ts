import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { createDaemonServer } from '../src/daemon/server';

describe('fs browse routes', () => {
  it('defaults to homedir and returns only directories', async () => {
    const { app } = createDaemonServer();
    const response = await app.inject({ method: 'GET', url: '/api/fs/list' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.path).toBe(homedir());
    expect(body.parent).toBe(dirname(homedir()));
    expect(body.isRoot).toBe(false);
    expect(Array.isArray(body.entries)).toBe(true);
    for (const entry of body.entries) {
      expect(entry.isDirectory).toBe(true);
      expect(entry.name.startsWith('.')).toBe(false);
    }
    // sorted by name
    const names = body.entries.map((e: { name: string }) => e.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    await app.close();
  });

  it('expands ~ in the path query', async () => {
    const { app } = createDaemonServer();
    const response = await app.inject({ method: 'GET', url: '/api/fs/list?path=~' });

    expect(response.statusCode).toBe(200);
    expect(response.json().path).toBe(homedir());
    await app.close();
  });

  it('marks filesystem root with isRoot and null parent', async () => {
    const { app } = createDaemonServer();
    const response = await app.inject({ method: 'GET', url: '/api/fs/list?path=/' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isRoot).toBe(true);
    expect(body.parent).toBeNull();
    await app.close();
  });

  it('returns 400 for an unreadable or missing path', async () => {
    const { app } = createDaemonServer();
    const response = await app.inject({ method: 'GET', url: '/api/fs/list?path=/no/such/dir/xyz123' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('cannot_read_directory');
    await app.close();
  });
});

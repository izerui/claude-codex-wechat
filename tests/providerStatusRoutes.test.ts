import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
import { schemaSql } from '../src/storage/schema';

describe('provider status routes', () => {
  it('returns Claude and Codex detection status', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app } = createDaemonServer({ db });

    const response = await app.inject({ method: 'GET', url: '/api/providers/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      claude: expect.any(Object),
      codex: expect.any(Object),
    });
    await app.close();
  });
});

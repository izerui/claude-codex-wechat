import type { FastifyInstance } from 'fastify';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expandTilde } from '../shared/expandTilde';

export type DirectoryEntry = {
  name: string;
  path: string;
  isDirectory: true;
};

export type DirectoryListing = {
  path: string;
  parent: string | null;
  isRoot: boolean;
  entries: DirectoryEntry[];
};

export function registerFsBrowseRoutes(input: { app: FastifyInstance }): void {
  input.app.get<{ Querystring: { path?: string } }>('/api/fs/list', async (request, reply) => {
    const raw = request.query.path?.trim();
    const target = resolve(expandTilde(raw && raw.length > 0 ? raw : homedir()) ?? homedir());

    let dirents;
    try {
      dirents = await readdir(target, { withFileTypes: true });
    } catch {
      reply.code(400);
      return { error: 'cannot_read_directory', path: target };
    }

    const entries: DirectoryEntry[] = dirents
      .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith('.'))
      .map((dirent) => ({ name: dirent.name, path: join(target, dirent.name), isDirectory: true as const }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = dirname(target);
    const isRoot = parent === target;
    const listing: DirectoryListing = {
      path: target,
      parent: isRoot ? null : parent,
      isRoot,
      entries,
    };
    return listing;
  });
}

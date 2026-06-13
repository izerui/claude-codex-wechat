import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { schemaSql } from './schema';

export type BridgeDatabase = Database.Database;

export function openBridgeDatabase(path: string): BridgeDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(schemaSql);
  return db;
}

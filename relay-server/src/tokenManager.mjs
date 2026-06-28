import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export function createClientToken() {
  return `clrt_${randomBytes(12).toString('hex')}`;
}

export function appendTokenToFile(input) {
  const { filePath, token } = input;
  const existing = readTokenFile(filePath);
  if (existing.includes(token)) {
    return {
      created: false,
      added: false,
      tokens: existing,
    };
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const nextTokens = [...existing, token];
  writeFileSync(filePath, `${nextTokens.join('\n')}\n`);
  return {
    created: existing.length === 0,
    added: true,
    tokens: nextTokens,
  };
}

function readTokenFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

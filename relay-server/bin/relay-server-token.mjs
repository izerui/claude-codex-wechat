#!/usr/bin/env node
import { appendTokenToFile, createClientToken } from '../src/tokenManager.mjs';

const args = process.argv.slice(2);
const fileFlagIndex = args.indexOf('--file');
const filePath = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : '';
if (fileFlagIndex >= 0 && !filePath) {
  process.stderr.write('--file requires a path\n');
  process.exit(1);
}

const token = createClientToken();
if (filePath) {
  appendTokenToFile({ filePath, token });
}
process.stdout.write(`${token}\n`);

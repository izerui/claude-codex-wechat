import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function persistWechatCredentialsToConfigFile(input: {
  configPath: string;
  accountId: string;
  token: string;
  baseUrl: string;
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const nextConfig = {
    ...currentConfig,
    wechat: {
      ...(isRecord(currentConfig.wechat) ? currentConfig.wechat : {}),
      enabled: true,
      baseUrl: input.baseUrl,
      token: input.token,
      accountId: input.accountId,
    },
  };

  await mkdir(dirname(input.configPath), { recursive: true });
  await writeFile(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

async function readConfigFile(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}

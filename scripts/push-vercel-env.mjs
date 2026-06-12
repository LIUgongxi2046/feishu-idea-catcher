#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadDotEnv } from '../src/env.mjs';

loadDotEnv();

const scope = process.argv.find((arg) => arg.startsWith('--scope='))?.slice('--scope='.length)
  || process.env.VERCEL_SCOPE;

if (!scope) {
  throw new Error('Missing Vercel scope. Set VERCEL_SCOPE in .env.local or pass --scope=your-team-or-user-scope.');
}

const envNames = [
  'WORKER_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_VERIFICATION_TOKEN',
  'FEISHU_ENCRYPT_KEY'
];

for (const name of envNames) {
  const value = process.env[name];
  if (!value) {
    console.log(`[SKIP] ${name} is empty`);
    continue;
  }
  upsertEnv(name, value);
}

function upsertEnv(name, value) {
  const remove = spawnSync('npm', [
    '--registry=https://registry.npmjs.org',
    'exec',
    '--yes',
    'vercel@latest',
    '--',
    'env',
    'rm',
    name,
    'production',
    '--yes',
    '--scope',
    scope
  ], {
    encoding: 'utf8',
    input: '',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (remove.status !== 0 && !`${remove.stderr}${remove.stdout}`.includes('not found')) {
    console.log(`[WARN] could not remove ${name}: ${`${remove.stderr}${remove.stdout}`.trim()}`);
  }

  const add = spawnSync('npm', [
    '--registry=https://registry.npmjs.org',
    'exec',
    '--yes',
    'vercel@latest',
    '--',
    'env',
    'add',
    name,
    'production',
    '--scope',
    scope
  ], {
    encoding: 'utf8',
    input: `${value}\n`,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (add.status !== 0) {
    throw new Error(`[FAIL] ${name}: ${`${add.stderr}${add.stdout}`.trim()}`);
  }
  console.log(`[OK] ${name}`);
}

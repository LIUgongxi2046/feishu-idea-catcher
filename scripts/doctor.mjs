#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDotEnv, optionalEnv } from '../src/env.mjs';

loadDotEnv();

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

const requiredForCloud = [
  'WORKER_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET'
];

const requiredForLocal = [
  'CLOUD_API_BASE_URL',
  'WORKER_API_TOKEN',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'OBSIDIAN_IDEA_LIST_DIR',
  'OBSIDIAN_REPORT_DIR'
];

for (const name of requiredForCloud) {
  check(`cloud env ${name}`, Boolean(process.env[name]), process.env[name] ? 'set' : 'missing');
}

for (const name of requiredForLocal) {
  check(`local env ${name}`, Boolean(process.env[name]), process.env[name] ? 'set' : 'missing');
}

check(
  'Feishu long-connection mode',
  Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
  'requires FEISHU_APP_ID and FEISHU_APP_SECRET; token/encrypt key are not needed'
);

const defaultIdeaListDir = path.join(process.env.HOME || process.cwd(), 'Documents', 'Obsidian Vault', 'Ideas');
const ideaListDir = optionalEnv('OBSIDIAN_IDEA_LIST_DIR', defaultIdeaListDir);
const reportDir = optionalEnv('OBSIDIAN_REPORT_DIR', optionalEnv('OBSIDIAN_IDEA_DIR', path.join(ideaListDir, 'plan-ceo-review')));
check('Obsidian idea list dir', fs.existsSync(ideaListDir), ideaListDir);
check('Obsidian report dir', fs.existsSync(reportDir), reportDir);

const chrome = optionalEnv('CHROME_BIN', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
check('Chrome binary', fs.existsSync(chrome), chrome);
if (fs.existsSync(chrome)) {
  const version = spawnSync(chrome, ['--version'], { encoding: 'utf8', timeout: 10000 });
  check('Chrome version', version.status === 0, (version.stdout || version.stderr || '').trim());
}

const codex = optionalEnv('CODEX_BIN', '/Applications/Codex.app/Contents/Resources/codex');
check('Codex binary', fs.existsSync(codex), codex);
if (fs.existsSync(codex)) {
  const version = spawnSync(codex, ['--version'], { encoding: 'utf8', timeout: 10000 });
  check('Codex version', version.status === 0, (version.stdout || version.stderr || '').trim());
}

const provider = optionalEnv('SEARCH_PROVIDER');
const researchEngine = optionalEnv('RESEARCH_ENGINE', 'external').toLowerCase();
const reportEngine = optionalEnv('REPORT_ENGINE', 'template').toLowerCase();
check('Worker queue source', optionalEnv('WORKER_QUEUE_SOURCE', 'upstash'), optionalEnv('WORKER_QUEUE_SOURCE', 'upstash'));
check('Report engine', reportEngine === 'codex' || reportEngine === 'template', reportEngine);
check('Research engine', researchEngine === 'codex' || researchEngine === 'external', researchEngine);
const imageEngine = optionalEnv('IMAGE_ENGINE', 'codex').toLowerCase();
check('Image engine', imageEngine === 'codex' || imageEngine === 'openai' || imageEngine === 'none', imageEngine);
if (imageEngine === 'codex') {
  check('Codex image generation', true, 'uses Codex built-in image_gen/image2; no OPENAI_API_KEY required');
}
if (imageEngine === 'openai') {
  check('OpenAI image API key', Boolean(process.env.OPENAI_API_KEY), process.env.OPENAI_API_KEY ? 'set' : 'missing: set OPENAI_API_KEY for automatic whiteboard PNG generation');
}
if (researchEngine === 'codex') {
  check('Search provider', true, 'handled by Codex web search');
} else if (!provider) {
  check('Search provider', false, 'optional but recommended: set SEARCH_PROVIDER=brave|bing|tavily');
} else {
  const keyMap = {
    brave: 'BRAVE_SEARCH_API_KEY',
    bing: 'BING_SEARCH_API_KEY',
    tavily: 'TAVILY_API_KEY'
  };
  check('Search provider', Boolean(keyMap[provider]), provider);
  if (keyMap[provider]) check(`search env ${keyMap[provider]}`, Boolean(process.env[keyMap[provider]]), process.env[keyMap[provider]] ? 'set' : 'missing');
}

for (const item of checks) {
  const mark = item.ok ? 'PASS' : 'WARN';
  console.log(`[${mark}] ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}

const hasHardFailure = checks.some((item) => item.name.startsWith('Chrome binary') && !item.ok)
  || checks.some((item) => item.name.startsWith('Codex binary') && !item.ok)
  || checks.some((item) => item.name === 'Obsidian idea list dir' && !item.ok)
  || checks.some((item) => item.name === 'Obsidian report dir' && !item.ok);

process.exit(hasHardFailure ? 1 : 0);

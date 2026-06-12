#!/usr/bin/env node
import { loadDotEnv } from '../src/env.mjs';
import { processIdea } from '../src/process-idea.mjs';

loadDotEnv();

const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('Usage: npm run test:local -- "你的想法"');
  process.exit(1);
}

const result = await processIdea({
  id: `local-${Date.now()}`,
  message_id: `local-${Date.now()}`,
  chat_id: '',
  text
});

console.log(JSON.stringify(result, null, 2));

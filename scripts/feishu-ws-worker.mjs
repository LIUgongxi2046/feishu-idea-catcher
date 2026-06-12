#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import * as Lark from '@larksuiteoapi/node-sdk';
import { loadDotEnv, requiredEnv } from '../src/env.mjs';
import { getTenantAccessToken, sendFeishuMessage } from '../src/feishu-client.mjs';
import { logLine, logError } from '../src/logger.mjs';
import { Upstash, enqueueIdea } from '../src/upstash.mjs';

loadDotEnv();

const statePath = path.resolve('state/feishu-ws-seen.json');
const seen = loadSeen();

const appId = requiredEnv('FEISHU_APP_ID');
const appSecret = requiredEnv('FEISHU_APP_SECRET');
const redis = new Upstash();

const wsClient = new Lark.WSClient({
  appId,
  appSecret,
  loggerLevel: Lark.LoggerLevel.info
});

const eventDispatcher = new Lark.EventDispatcher({}).register({
  'im.message.receive_v1': async (data) => {
    await handleMessageEvent(data);
  }
});

logLine('worker_starting');
await wsClient.start({ eventDispatcher });
logLine('worker_started');

setInterval(() => {
  logLine('worker_heartbeat', wsClient.getConnectionStatus?.() || {});
}, 60000);

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logError('uncaught_exception', error);
});
process.on('unhandledRejection', (error) => {
  logError('unhandled_rejection', error);
});

async function handleMessageEvent(data) {
  const message = data?.message || {};
  const messageId = message.message_id;
  if (!messageId) return;
  if (seen[messageId]) {
    logLine('duplicate_message_ignored', { messageId });
    return;
  }
  seen[messageId] = new Date().toISOString();
  saveSeen();

  const chatId = message.chat_id;
  const text = extractText(message);

  if (message.message_type !== 'text' || !text) {
    await safeSendText(chatId, '我现在只处理文字想法。请把语音转成文字，或者直接发送文字。');
    return;
  }

  logLine('message_received', { messageId, text });

  try {
    const result = await enqueueIdea(redis, {
      message_id: messageId,
      chat_id: chatId,
      sender_id: data?.sender?.sender_id?.open_id || '',
      sender_type: data?.sender?.sender_type || '',
      text
    });
    logLine('idea_enqueued', { messageId, id: result.id, duplicate: result.duplicate });
    const ack = result.duplicate
      ? `这条想法已经在队列里了，我不会重复处理：${text.slice(0, 60)}`
      : `收到，已进入慢任务队列：${text.slice(0, 60)}\n我会完成 Codex 深度评审、竞品扫描、PDF 后再回传。`;
    await safeSendText(chatId, ack);
  } catch (error) {
    logError('enqueue_failed', error);
    await safeSendText(chatId, `入队失败：${String(error?.message || error).slice(0, 400)}`);
  }
}

function extractText(message) {
  try {
    const content = JSON.parse(message.content || '{}');
    return String(content.text || '').trim();
  } catch {
    return String(message.content || '').trim();
  }
}

async function safeSendText(chatId, text) {
  if (!chatId) return;
  try {
    const token = await getTenantAccessToken();
    await sendFeishuMessage(chatId, 'text', { text }, token);
  } catch (error) {
    logError('send_text_failed', error);
  }
}

function loadSeen() {
  try {
    if (!fs.existsSync(statePath)) return {};
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveSeen() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const entries = Object.entries(seen).slice(-1000);
  fs.writeFileSync(statePath, JSON.stringify(Object.fromEntries(entries), null, 2), 'utf8');
}

function shutdown(signal) {
  logLine('worker_shutdown', { signal });
  saveSeen();
  wsClient.close({ force: true });
  process.exit(0);
}

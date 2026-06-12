import crypto from 'node:crypto';
import { requiredEnv } from './env.mjs';

export class Upstash {
  constructor(options = {}) {
    this.url = options.url || requiredEnv('UPSTASH_REDIS_REST_URL');
    this.token = options.token || requiredEnv('UPSTASH_REDIS_REST_TOKEN');
  }

  async command(command) {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(command)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(`Upstash command failed: ${payload.error || response.statusText}`);
    }
    return payload.result;
  }

  async getJson(key) {
    const value = await this.command(['GET', key]);
    return value ? JSON.parse(value) : null;
  }

  async setJson(key, value) {
    return this.command(['SET', key, JSON.stringify(value)]);
  }
}

export function createIdeaId(messageId) {
  const source = messageId || crypto.randomUUID();
  return encodeURIComponent(source).replace(/%/g, '');
}

export async function enqueueIdea(redis, idea) {
  const id = createIdeaId(idea.message_id);
  const seenKey = `seen_message:${idea.message_id || id}`;
  const seen = await redis.command(['SET', seenKey, '1', 'NX', 'EX', '2592000']);
  if (seen !== 'OK') return { id, duplicate: true };

  const now = new Date().toISOString();
  const record = {
    id,
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
    ...idea
  };
  await redis.setJson(`idea:${id}`, record);
  await redis.command(['RPUSH', 'pending_ideas', id]);
  return { id, duplicate: false };
}

export async function claimPendingIdeas(redis, limit = 3) {
  const ideas = [];
  for (let index = 0; index < limit; index += 1) {
    const id = await redis.command(['LPOP', 'pending_ideas']);
    if (!id) break;
    const idea = await redis.getJson(`idea:${id}`);
    if (!idea || idea.status === 'done') continue;

    const record = {
      ...idea,
      status: 'processing',
      attempts: Number(idea.attempts || 0) + 1,
      updated_at: new Date().toISOString()
    };
    await redis.setJson(`idea:${id}`, record);
    ideas.push(record);
  }
  return ideas;
}

export async function markIdeaDone(redis, id, patch = {}) {
  const idea = (await redis.getJson(`idea:${id}`)) || { id };
  const record = {
    ...idea,
    ...patch,
    status: 'done',
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await redis.setJson(`idea:${id}`, record);
  return record;
}

export async function markIdeaFailed(redis, id, error, options = {}) {
  const idea = (await redis.getJson(`idea:${id}`)) || { id };
  const attempts = Number(idea.attempts || 0);
  const retry = options.retry !== false && attempts < Number(options.maxAttempts || 5);
  const record = {
    ...idea,
    status: retry ? 'pending' : 'failed',
    last_error: String(error || 'unknown error').slice(0, 2000),
    updated_at: new Date().toISOString()
  };
  await redis.setJson(`idea:${id}`, record);
  if (retry) await redis.command(['RPUSH', 'pending_ideas', id]);
  return record;
}

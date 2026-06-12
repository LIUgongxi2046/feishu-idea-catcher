import { requiredEnv } from './env.mjs';

export async function fetchPendingIdeas(limit = 3) {
  const baseUrl = requiredEnv('CLOUD_API_BASE_URL').replace(/\/+$/g, '');
  const response = await fetch(`${baseUrl}/api/ideas/pending?limit=${limit}`, {
    headers: { authorization: `Bearer ${requiredEnv('WORKER_API_TOKEN')}` }
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || response.statusText);
  }
  return payload.ideas || [];
}

export async function markDone(id, patch = {}) {
  return updateIdea(id, 'done', patch);
}

export async function markFailed(id, error, options = {}) {
  return updateIdea(id, 'failed', {
    error: String(error?.stack || error?.message || error),
    ...options
  });
}

async function updateIdea(id, action, body) {
  const baseUrl = requiredEnv('CLOUD_API_BASE_URL').replace(/\/+$/g, '');
  const response = await fetch(`${baseUrl}/api/ideas/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${requiredEnv('WORKER_API_TOKEN')}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || response.statusText);
  }
  return payload.idea;
}

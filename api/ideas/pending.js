import { readJsonBody, requireWorkerAuth, sendJson } from '../../src/http.mjs';
import { Upstash, claimPendingIdeas } from '../../src/upstash.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  try {
    requireWorkerAuth(req);
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const url = new URL(req.url, 'https://local.invalid');
    const limit = Number(body.limit || url.searchParams.get('limit') || 3);
    const redis = new Upstash();
    const ideas = await claimPendingIdeas(redis, Math.max(1, Math.min(limit, 10)));
    return sendJson(res, 200, { ok: true, ideas });
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'internal_error' });
  }
}

import { readJsonBody, requireWorkerAuth, sendJson } from '../../../src/http.mjs';
import { Upstash, markIdeaFailed } from '../../../src/upstash.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  try {
    requireWorkerAuth(req);
    const body = await readJsonBody(req);
    const { id } = req.query;
    const redis = new Upstash();
    const record = await markIdeaFailed(redis, id, body.error || 'unknown error', {
      retry: body.retry !== false,
      maxAttempts: body.maxAttempts || 5
    });
    return sendJson(res, 200, { ok: true, idea: record });
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'internal_error' });
  }
}

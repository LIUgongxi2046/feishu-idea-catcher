import { readJsonBody, sendJson } from '../../src/http.mjs';
import { Upstash, enqueueIdea } from '../../src/upstash.mjs';
import { extractTextIdea, handleUrlVerification, normalizeFeishuBody } from '../../src/feishu-events.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  try {
    const raw = await readJsonBody(req);
    const body = normalizeFeishuBody(raw);
    const verification = handleUrlVerification(body);
    if (verification) return sendJson(res, 200, verification);

    const idea = extractTextIdea(body);
    if (!idea) return sendJson(res, 200, { ok: true, ignored: true });

    const redis = new Upstash();
    const result = await enqueueIdea(redis, idea);
    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'internal_error'
    });
  }
}

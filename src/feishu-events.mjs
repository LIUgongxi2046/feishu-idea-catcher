import crypto from 'node:crypto';

export function decryptFeishuPayload(encrypt, encryptKey) {
  const key = crypto.createHash('sha256').update(encryptKey).digest();
  const encrypted = Buffer.from(encrypt, 'base64');
  const iv = encrypted.subarray(0, 16);
  const data = encrypted.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}

export function normalizeFeishuBody(body) {
  if (body?.encrypt) {
    const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
    if (!encryptKey) throw new Error('Encrypted Feishu payload received but FEISHU_ENCRYPT_KEY is missing');
    return decryptFeishuPayload(body.encrypt, encryptKey);
  }
  return body;
}

export function handleUrlVerification(body) {
  if (body?.type !== 'url_verification') return null;
  const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;
  if (expectedToken && body.token && body.token !== expectedToken) {
    const err = new Error('Feishu verification token mismatch');
    err.statusCode = 403;
    throw err;
  }
  return { challenge: body.challenge };
}

export function extractTextIdea(body) {
  const event = body?.event;
  const header = body?.header || {};
  const eventType = header.event_type || body?.type;
  if (eventType && eventType !== 'im.message.receive_v1') return null;

  const message = event?.message;
  if (!message) return null;
  if (message.message_type !== 'text') return null;

  let text = '';
  try {
    const content = JSON.parse(message.content || '{}');
    text = content.text || '';
  } catch {
    text = message.content || '';
  }

  text = String(text).trim();
  if (!text) return null;

  return {
    message_id: message.message_id,
    chat_id: message.chat_id,
    sender_id: event?.sender?.sender_id?.open_id || event?.sender?.sender_id?.user_id || '',
    sender_type: event?.sender?.sender_type || '',
    text,
    raw_event_type: eventType || ''
  };
}

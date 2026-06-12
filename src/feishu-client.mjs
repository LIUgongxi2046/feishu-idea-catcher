import fs from 'node:fs';
import path from 'node:path';
import { optionalEnv, requiredEnv } from './env.mjs';

const FEISHU_API = 'https://open.feishu.cn/open-apis';
const FEISHU_TIMEOUT_MS = Number(process.env.FEISHU_API_TIMEOUT_MS || 20000);
let tenantTokenCache = {
  token: '',
  expiresAt: 0
};

export async function getTenantAccessToken() {
  const now = Date.now();
  if (tenantTokenCache.token && tenantTokenCache.expiresAt > now + 60000) {
    return tenantTokenCache.token;
  }

  const payload = await fetchJsonWithRetry(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      app_id: requiredEnv('FEISHU_APP_ID'),
      app_secret: requiredEnv('FEISHU_APP_SECRET')
    })
  });
  if (payload.code !== 0) {
    throw new Error(`Feishu tenant token failed: ${payload.msg || 'unknown error'}`);
  }
  tenantTokenCache = {
    token: payload.tenant_access_token,
    expiresAt: Date.now() + Math.max(Number(payload.expire || 7200) - 300, 60) * 1000
  };
  return tenantTokenCache.token;
}

export async function uploadFeishuFile(filePath, token) {
  const fileName = path.basename(filePath);
  const bytes = fs.readFileSync(filePath);
  const form = new FormData();
  form.set('file_type', inferFileType(fileName));
  form.set('file_name', fileName);
  form.set('file', new Blob([bytes]), fileName);

  const payload = await fetchJsonWithRetry(`${FEISHU_API}/im/v1/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form
  });
  if (payload.code !== 0) {
    throw new Error(`Feishu file upload failed: ${payload.msg || 'unknown error'}`);
  }
  return payload.data.file_key;
}

export async function sendFeishuMessage(chatId, msgType, content, token) {
  const url = new URL(`${FEISHU_API}/im/v1/messages`);
  url.searchParams.set('receive_id_type', 'chat_id');
  const payload = await fetchJsonWithRetry(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: msgType,
      content: JSON.stringify(content)
    })
  });
  if (payload.code !== 0) {
    throw new Error(`Feishu send message failed: ${payload.msg || 'unknown error'}`);
  }
  return payload.data;
}

export async function sendReportToFeishu({ chatId, pdfPath, markdownPath, title }) {
  if (!chatId) return { skipped: true, reason: 'chat_id missing' };
  const token = await getTenantAccessToken();
  await sendFeishuMessage(chatId, 'text', {
    text: `已完成灵感评审：${title}\nMarkdown：${markdownPath}`
  }, token);
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return {
      skipped: true,
      reason: 'pdf_missing',
      markdownPath
    };
  }
  const fileKey = await uploadFeishuFile(pdfPath, token);
  const fileMessage = await sendFeishuMessage(chatId, 'file', { file_key: fileKey }, token);
  return { skipped: false, file_key: fileKey, message: fileMessage };
}

function inferFileType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.doc' || ext === '.docx') return 'doc';
  if (ext === '.xls' || ext === '.xlsx') return 'xls';
  if (ext === '.ppt' || ext === '.pptx') return 'ppt';
  if (ext === '.mp4') return 'mp4';
  return optionalEnv('FEISHU_UPLOAD_FILE_TYPE', 'stream');
}

async function fetchJsonWithRetry(url, options, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FEISHU_TIMEOUT_MS)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.msg || payload?.message || response.statusText);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  throw lastError;
}

import fs from 'node:fs';
import path from 'node:path';

const defaultLogPath = path.resolve('state/feishu-ws-worker.log');
let consoleBroken = false;

process.stdout?.on?.('error', (error) => {
  if (error?.code === 'EPIPE') consoleBroken = true;
});

export function logLine(message, data = undefined, logPath = defaultLogPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const suffix = data === undefined ? '' : ` ${safeJson(data)}`;
  const line = `[${new Date().toISOString()}] ${message}${suffix}`;
  fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  if (!consoleBroken) {
    try {
      console.log(line);
    } catch (error) {
      if (error?.code === 'EPIPE') consoleBroken = true;
      else throw error;
    }
  }
}

export function logError(message, error, logPath = defaultLogPath) {
  const payload = {
    message: error?.message || String(error),
    stack: error?.stack || ''
  };
  logLine(message, payload, logPath);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

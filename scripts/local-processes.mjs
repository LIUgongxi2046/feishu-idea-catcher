import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, 'state');
const pidDir = path.join(stateDir, 'pids');
const logDir = path.join(stateDir, 'logs');

const services = [
  {
    name: 'listener',
    script: path.join(root, 'scripts', 'feishu-ws-worker.mjs'),
    pidPath: path.join(pidDir, 'listener.pid'),
    outPath: path.join(logDir, 'listener.out.log'),
    errPath: path.join(logDir, 'listener.err.log')
  },
  {
    name: 'worker',
    script: path.join(root, 'scripts', 'worker.mjs'),
    pidPath: path.join(pidDir, 'worker.pid'),
    outPath: path.join(logDir, 'worker.out.log'),
    errPath: path.join(logDir, 'worker.err.log')
  }
];

function ensureDirs() {
  fs.mkdirSync(pidDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
}

function readPid(service) {
  if (!fs.existsSync(service.pidPath)) return null;
  const raw = fs.readFileSync(service.pidPath, 'utf8').trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function openLog(file) {
  return fs.openSync(file, 'a');
}

function startService(service) {
  ensureDirs();
  const existingPid = readPid(service);
  if (isRunning(existingPid)) {
    return { name: service.name, status: 'already_running', pid: existingPid };
  }

  const out = openLog(service.outPath);
  const err = openLog(service.errPath);
  const child = spawn(process.execPath, [service.script], {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: ['ignore', out, err]
  });
  child.unref();
  fs.writeFileSync(service.pidPath, `${child.pid}\n`);
  return { name: service.name, status: 'started', pid: child.pid };
}

async function stopService(service) {
  const pid = readPid(service);
  if (!pid) {
    return { name: service.name, status: 'not_running' };
  }
  if (!isRunning(pid)) {
    fs.rmSync(service.pidPath, { force: true });
    return { name: service.name, status: 'stale_pid_removed', pid };
  }

  process.kill(pid, 'SIGTERM');
  const stopped = await waitForStop(pid, 8000);
  if (!stopped && isRunning(pid)) {
    process.kill(pid, 'SIGKILL');
    await waitForStop(pid, 2000);
  }
  fs.rmSync(service.pidPath, { force: true });
  return { name: service.name, status: isRunning(pid) ? 'stop_failed' : 'stopped', pid };
}

function waitForStop(pid, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!isRunning(pid)) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 250);
  });
}

function statusService(service) {
  const pid = readPid(service);
  const running = isRunning(pid);
  return { name: service.name, status: running ? 'running' : 'stopped', pid: running ? pid : null };
}

function printResults(action, results) {
  console.log(JSON.stringify({
    action,
    time: new Date().toISOString(),
    results
  }, null, 2));
}

const action = process.argv[2] || 'status';

if (action === 'start') {
  printResults(action, services.map(startService));
} else if (action === 'stop') {
  const results = [];
  for (const service of services) results.push(await stopService(service));
  printResults(action, results);
} else if (action === 'status') {
  printResults(action, services.map(statusService));
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(2);
}

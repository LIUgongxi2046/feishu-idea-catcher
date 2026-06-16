import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uid = process.getuid();
const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const nodeBin = process.env.LAUNCHD_NODE_BIN || process.execPath;
const services = [
  {
    name: 'listener',
    label: 'com.feishu-idea-catcher.listener',
    script: path.join(root, 'scripts', 'feishu-ws-worker.mjs'),
    outPath: path.join(root, 'state', 'launchd-listener.out.log'),
    errPath: path.join(root, 'state', 'launchd-listener.err.log')
  },
  {
    name: 'worker',
    label: 'com.feishu-idea-catcher.worker',
    script: path.join(root, 'scripts', 'worker.mjs'),
    outPath: path.join(root, 'state', 'launchd-worker.out.log'),
    errPath: path.join(root, 'state', 'launchd-worker.err.log')
  }
];

function plistPath(service) {
  return path.join(launchAgentsDir, `${service.label}.plist`);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function servicePlist(service) {
  const command = `cd ${shellQuote(root)} && exec ${shellQuote(nodeBin)} ${shellQuote(service.script)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${service.label}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>${xmlEscape(command)}</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${xmlEscape(os.homedir())}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${xmlEscape(service.outPath)}</string>

  <key>StandardErrorPath</key>
  <string>${xmlEscape(service.errPath)}</string>
</dict>
</plist>
`;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
}

function ensureInstalled() {
  fs.mkdirSync(launchAgentsDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'state'), { recursive: true });
  for (const service of services) {
    fs.writeFileSync(plistPath(service), servicePlist(service), 'utf8');
  }
}

function ensureInstallForStart(service) {
  const file = plistPath(service);
  if (fs.existsSync(file)) return { installed: true, plist: file };
  try {
    ensureInstalled();
    return { installed: true, plist: file, created: true };
  } catch (error) {
    return {
      installed: false,
      plist: file,
      error: error?.message || String(error),
      hint: 'Run `npm run launchd:install` once from an interactive terminal or an approved elevated session.'
    };
  }
}

function bootout(service) {
  return run('launchctl', ['bootout', `gui/${uid}/${service.label}`]);
}

function bootstrap(service) {
  return run('launchctl', ['bootstrap', `gui/${uid}`, plistPath(service)]);
}

function kickstart(service) {
  return run('launchctl', ['kickstart', '-k', `gui/${uid}/${service.label}`]);
}

function print(service) {
  return run('launchctl', ['print', `gui/${uid}/${service.label}`]);
}

function summarizePrint(service, result) {
  if (result.status !== 0) {
    return { name: service.name, label: service.label, status: 'not_loaded', detail: result.stderr || result.stdout };
  }
  const pidMatch = result.stdout.match(/pid = (\d+)/);
  const stateMatch = result.stdout.match(/state = ([^\n]+)/);
  return {
    name: service.name,
    label: service.label,
    status: pidMatch ? 'running' : 'loaded',
    pid: pidMatch ? Number(pidMatch[1]) : null,
    state: stateMatch ? stateMatch[1].trim() : ''
  };
}

function start() {
  const results = [];
  for (const service of services) {
    const install = ensureInstallForStart(service);
    if (!install.installed) {
      results.push({ name: service.name, label: service.label, install });
      continue;
    }
    bootout(service);
    const boot = bootstrap(service);
    const kick = kickstart(service);
    results.push({ name: service.name, label: service.label, plist: plistPath(service), install, bootstrap: boot, kickstart: kick });
  }
  return results;
}

function stop() {
  return services.map((service) => ({ name: service.name, label: service.label, bootout: bootout(service) }));
}

function status() {
  return services.map((service) => summarizePrint(service, print(service)));
}

const action = process.argv[2] || 'status';
let results;

if (action === 'start') results = start();
else if (action === 'stop') results = stop();
else if (action === 'status') results = status();
else if (action === 'install') {
  ensureInstalled();
  results = services.map((service) => ({ name: service.name, label: service.label, plist: plistPath(service) }));
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(2);
}

console.log(JSON.stringify({ action, time: new Date().toISOString(), results }, null, 2));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uid = process.getuid();
const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const nodeBin = process.env.LAUNCHD_NODE_BIN || process.execPath;
const labelPrefix = process.env.LAUNCHD_LABEL_PREFIX || 'com.feishu-idea-catcher';
const scheduleLogDir = process.env.LAUNCHD_SCHEDULE_LOG_DIR || os.tmpdir();

const jobs = [
  {
    name: 'start',
    label: `${labelPrefix}.schedule-start`,
    hour: 6,
    minute: 0,
    action: 'start',
    logPath: path.join(scheduleLogDir, 'feishu-idea-catcher-schedule-start.log'),
    errPath: path.join(scheduleLogDir, 'feishu-idea-catcher-schedule-start.err.log')
  },
  {
    name: 'stop',
    label: `${labelPrefix}.schedule-stop`,
    hour: 0,
    minute: 0,
    action: 'stop',
    logPath: path.join(scheduleLogDir, 'feishu-idea-catcher-schedule-stop.log'),
    errPath: path.join(scheduleLogDir, 'feishu-idea-catcher-schedule-stop.err.log')
  }
];

function plistPath(job) {
  return path.join(launchAgentsDir, `${job.label}.plist`);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function plist(job) {
  const runnerScript = path.join(root, 'scripts', 'launchd-schedule-runner.mjs');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${job.label}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodeBin)}</string>
    <string>${xmlEscape(runnerScript)}</string>
    <string>${xmlEscape(job.action)}</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${job.hour}</integer>
    <key>Minute</key>
    <integer>${job.minute}</integer>
  </dict>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${xmlEscape(os.homedir())}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>${xmlEscape(job.logPath)}</string>

  <key>StandardErrorPath</key>
  <string>${xmlEscape(job.errPath)}</string>
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

function bootout(job) {
  return run('launchctl', ['bootout', `gui/${uid}/${job.label}`]);
}

function bootstrap(job) {
  return run('launchctl', ['bootstrap', `gui/${uid}`, plistPath(job)]);
}

function kickstart(job) {
  return run('launchctl', ['kickstart', '-k', `gui/${uid}/${job.label}`]);
}

function print(job) {
  return run('launchctl', ['print', `gui/${uid}/${job.label}`]);
}

function install() {
  fs.mkdirSync(launchAgentsDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'state'), { recursive: true });

  const results = [];
  for (const job of jobs) {
    fs.writeFileSync(plistPath(job), plist(job), 'utf8');
    bootout(job);
    results.push({
      name: job.name,
      label: job.label,
      schedule: `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`,
      plist: plistPath(job),
      bootstrap: bootstrap(job)
    });
  }
  return results;
}

function uninstall() {
  const results = [];
  for (const job of jobs) {
    const out = bootout(job);
    fs.rmSync(plistPath(job), { force: true });
    results.push({ name: job.name, label: job.label, bootout: out, removed: plistPath(job) });
  }
  return results;
}

function status() {
  return jobs.map((job) => {
    const result = print(job);
    return {
      name: job.name,
      label: job.label,
      schedule: `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`,
      loaded: result.status === 0,
      detail: result.status === 0 ? 'loaded' : result.stderr || result.stdout,
      plist: plistPath(job),
      logPath: job.logPath,
      errPath: job.errPath
    };
  });
}

function testStart() {
  const job = jobs.find((item) => item.name === 'start');
  return [{ name: job.name, label: job.label, kickstart: kickstart(job) }];
}

function testStop() {
  const job = jobs.find((item) => item.name === 'stop');
  return [{ name: job.name, label: job.label, kickstart: kickstart(job) }];
}

const action = process.argv[2] || 'status';
let results;

if (action === 'install') results = install();
else if (action === 'uninstall') results = uninstall();
else if (action === 'status') results = status();
else if (action === 'test-start') results = testStart();
else if (action === 'test-stop') results = testStop();
else {
  console.error(`Unknown action: ${action}`);
  process.exit(2);
}

console.log(JSON.stringify({ action, time: new Date().toISOString(), results }, null, 2));

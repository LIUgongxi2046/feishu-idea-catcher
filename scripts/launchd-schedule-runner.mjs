import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];

if (!['start', 'stop'].includes(action)) {
  console.error(`Unknown schedule action: ${action}`);
  process.exit(2);
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status || 0;
}

console.log(`[${new Date().toISOString()}] schedule ${action} begin`);
const actionStatus = run([path.join(root, 'scripts', 'launchd-control.mjs'), action]);
const statusStatus = run([path.join(root, 'scripts', 'launchd-control.mjs'), 'status']);
console.log(`[${new Date().toISOString()}] schedule ${action} end`);

process.exit(actionStatus || statusStatus);

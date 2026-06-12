import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { optionalEnv } from './env.mjs';
import { safeFileName } from './naming.mjs';

export function captureScreenshots(results, assetsDir, options = {}) {
  fs.mkdirSync(assetsDir, { recursive: true });
  const chrome = options.chrome || optionalEnv('CHROME_BIN', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  const limit = Math.min(Number(options.limit || 3), results.length);
  const updated = results.map((result) => ({ ...result }));

  for (let index = 0; index < limit; index += 1) {
    const result = updated[index];
    const fileName = `${String(index + 1).padStart(2, '0')}-${safeFileName(result.title || 'page')}.png`;
    const target = path.join(assetsDir, fileName);
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      `--screenshot=${target}`,
      result.url
    ];
    const run = spawnSync(chrome, args, { encoding: 'utf8', timeout: 30000 });
    if (run.status === 0 && fs.existsSync(target)) {
      result.screenshot = target;
      result.screenshot_error = '';
    } else {
      result.screenshot = '';
      result.screenshot_error = (run.stderr || run.stdout || '截图失败').trim().slice(0, 500);
    }
  }

  return updated;
}

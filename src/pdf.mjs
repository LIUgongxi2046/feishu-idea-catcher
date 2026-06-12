import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { markdownToHtml } from './markdown.mjs';
import { optionalEnv } from './env.mjs';

export function renderPdfFromMarkdown(markdownPath, pdfPath, options = {}) {
  const chrome = options.chrome || optionalEnv('CHROME_BIN', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const htmlPath = markdownPath.replace(/\.md$/i, '.html');
  const html = markdownToHtml(markdown, { baseDir: path.dirname(markdownPath) });
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-pdf-chrome-'));

  const run = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
    '--allow-file-access-from-files',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`
  ], { encoding: 'utf8', timeout: 60000 });

  if (fs.existsSync(pdfPath)) {
    return { htmlPath, pdfPath };
  }

  if (run.status !== 0 || run.error || run.signal) {
    const detail = [
      `status=${run.status}`,
      `signal=${run.signal || ''}`,
      run.error ? `error=${run.error.message}` : '',
      (run.stderr || run.stdout || '').trim()
    ].filter(Boolean).join(' ');
    throw new Error(`Chrome PDF export failed: ${detail}`);
  }
  throw new Error('Chrome PDF export failed: no PDF file was produced');
}

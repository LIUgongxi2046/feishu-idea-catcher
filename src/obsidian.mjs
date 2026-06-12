import fs from 'node:fs';
import path from 'node:path';
import { formatDateParts } from './naming.mjs';

export function ensureIdeaDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const listPath = path.join(dir, 'idea list.md');
  if (!fs.existsSync(listPath)) {
    fs.writeFileSync(
      listPath,
      '| 日期 | 想法 |\n| --- | --- |\n',
      'utf8'
    );
  }
  return listPath;
}

export function appendIdeaToList(dir, ideaText, date = new Date()) {
  const listPath = ensureIdeaDir(dir);
  const { dotted } = formatDateParts(date);
  const escaped = String(ideaText || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const row = `| ${dotted} | ${escaped} |`;
  const text = fs.readFileSync(listPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const emptyIndex = lines.findIndex((line) => /^\|\s*\|\s*\|\s*$/.test(line));
  if (emptyIndex >= 0) {
    lines[emptyIndex] = row;
    fs.writeFileSync(listPath, `${lines.join('\n')}${text.endsWith('\n') ? '' : '\n'}`, 'utf8');
  } else {
    const next = text.endsWith('\n') ? `${text}${row}\n` : `${text}\n${row}\n`;
    fs.writeFileSync(listPath, next, 'utf8');
  }
  return listPath;
}

export function writeMarkdown(filePath, markdown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

export function obsidianOpenUri(filePath, options = {}) {
  const vaultRoot = options.vaultRoot || process.env.OBSIDIAN_VAULT_ROOT || path.join(process.env.HOME || process.cwd(), 'Documents', 'Obsidian Vault');
  const vaultName = options.vaultName || process.env.OBSIDIAN_VAULT_NAME || path.basename(vaultRoot);
  const relative = path.relative(vaultRoot, filePath).replace(/\\/g, '/').replace(/\.md$/i, '');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relative)}`;
}

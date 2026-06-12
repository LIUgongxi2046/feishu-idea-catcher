import path from 'node:path';

export function markdownToHtml(markdown, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let listType = '';

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = '';
    }
  };

  const openList = (type) => {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2], baseDir)}</h${level}>`);
      continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      closeList();
      html.push(`<figure><img src="${assetSrc(image[2], baseDir)}" alt="${escapeHtml(image[1])}"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote>${inline(quote[1], baseDir)}</blockquote>`);
      continue;
    }
    const list = line.match(/^[-*]\s+(.+)$/);
    if (list) {
      openList('ul');
      html.push(`<li>${inline(list[1], baseDir)}</li>`);
      continue;
    }
    const orderedList = line.match(/^\d+[.、]\s+(.+)$/);
    if (orderedList) {
      openList('ol');
      html.push(`<li>${inline(orderedList[1], baseDir)}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line, baseDir)}</p>`);
  }
  closeList();

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #1f2328; line-height: 1.72; margin: 0; }
  h1, h2, h3, h4, h5, h6 {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    line-break: anywhere;
  }
  h1 { font-size: 34px; line-height: 1.22; margin: 0 0 22px; color: #111827; }
  h2 { font-size: 25px; line-height: 1.3; margin-top: 34px; padding-top: 16px; border-top: 1px solid #d8dee4; color: #111827; }
  h3 { font-size: 20px; line-height: 1.38; margin-top: 24px; color: #24292f; }
  p, li, blockquote { font-size: 17px; }
  p { margin: 10px 0; }
  li { margin: 6px 0; }
  strong { color: #111827; font-weight: 800; }
  li strong:first-child, p strong:first-child { color: #0f766e; }
  blockquote { margin: 14px 0; padding: 12px 16px; background: #f6f8fa; border-left: 4px solid #0f766e; color: #374151; border-radius: 0 6px 6px 0; }
  ul, ol { padding-left: 22px; margin: 10px 0 14px; }
  a { color: #0969da; text-decoration: none; overflow-wrap: anywhere; }
  figure { margin: 18px 0 24px; page-break-inside: avoid; break-inside: avoid; }
  img { display: block; max-width: 100%; max-height: 560px; object-fit: contain; border: 1px solid #d8dee4; border-radius: 6px; }
  figcaption { font-size: 13px; color: #57606a; margin-top: 6px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f6f8fa; padding: 1px 4px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #d8dee4; padding: 8px; vertical-align: top; font-size: 14px; overflow-wrap: anywhere; word-break: break-word; }
  th { background: #f6f8fa; }
</style>
</head>
<body>
${html.join('\n')}
</body>
</html>`;
}

function inline(text, baseDir) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${escapeAttr(href)}">${label}</a>`);
}

function assetSrc(src, baseDir) {
  if (/^https?:\/\//.test(src) || src.startsWith('file://')) return escapeAttr(src);
  if (path.isAbsolute(src)) return `file://${escapeAttr(src)}`;
  return `file://${escapeAttr(path.resolve(baseDir, src))}`;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

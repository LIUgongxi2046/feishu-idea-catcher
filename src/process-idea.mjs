import fs from 'node:fs';
import path from 'node:path';
import { generateReport } from './codex-report.mjs';
import { optionalEnv } from './env.mjs';
import { formatDateParts, ideaDisplayTitle, ideaShortName, safeFileName, shouldQuickRecordOnly } from './naming.mjs';
import { appendIdeaToList, ensureIdeaDir, obsidianOpenUri, writeMarkdown } from './obsidian.mjs';
import { renderPdfFromMarkdown } from './pdf.mjs';
import { researchCompetitors } from './search.mjs';
import { captureScreenshots } from './screenshot.mjs';
import { logLine, logError } from './logger.mjs';
import { buildWhiteboardPrompt } from './whiteboard-prompt.mjs';
import { generateWhiteboardImage } from './image-generation.mjs';

export async function processIdea(idea) {
  const ideaListDir = optionalEnv(
    'OBSIDIAN_IDEA_LIST_DIR',
    path.join(process.env.HOME || process.cwd(), 'Documents', 'Obsidian Vault', 'Ideas')
  );
  const reportDir = optionalEnv(
    'OBSIDIAN_REPORT_DIR',
    optionalEnv('OBSIDIAN_IDEA_DIR', path.join(ideaListDir, 'plan-ceo-review'))
  );
  ensureIdeaDir(ideaListDir);
  fs.mkdirSync(reportDir, { recursive: true });
  appendIdeaToList(ideaListDir, idea.text);
  logLine('idea_appended', { id: idea.id, listDir: ideaListDir });

  const shortName = ideaShortName(idea.text);
  const displayTitle = ideaDisplayTitle(idea.text);
  const { ymd } = formatDateParts();
  const baseName = safeFileName(`${ymd}-${displayTitle || shortName}`);
  const outputDir = path.join(reportDir, ymd);
  fs.mkdirSync(outputDir, { recursive: true });

  if (shouldQuickRecordOnly(idea.text)) {
    return {
      quickRecordOnly: true,
      title: displayTitle || shortName,
      listPath: path.join(ideaListDir, 'idea list.md')
    };
  }

  const assetsDir = path.join(outputDir, 'assets', baseName);
  fs.mkdirSync(assetsDir, { recursive: true });

  const research = optionalEnv('RESEARCH_ENGINE', 'external').toLowerCase() === 'codex'
    ? {
        provider: 'codex_web_search',
        queries: [],
        results: [],
        error: '竞品扫描由 Codex 报告阶段通过 web search 完成。'
      }
    : await researchCompetitors(idea.text);
  logLine('research_done', { id: idea.id, provider: research.provider, results: research.results.length, error: research.error || '' });
  if (research.results.length) {
    research.results = captureScreenshots(research.results, assetsDir, { limit: 3 });
    logLine('screenshots_done', { id: idea.id, results: research.results.length });
  }

  const markdown = normalizeReportTitle(generateReport({
    ideaText: idea.text,
    shortName,
    displayTitle,
    research
  }), displayTitle || shortName);

  const markdownPath = path.join(outputDir, `${baseName}.md`);
  const visualPromptPath = path.join(assetsDir, `${baseName}-whiteboard-prompt.md`);
  const whiteboardPrompt = buildWhiteboardPrompt({
    ideaText: idea.text,
    shortName,
    displayTitle,
    reportMarkdown: markdown
  });
  writeMarkdown(visualPromptPath, whiteboardPrompt);
  logLine('whiteboard_prompt_written', { id: idea.id, visualPromptPath });
  const imageResult = await generateWhiteboardImage({
    prompt: whiteboardPrompt,
    outputPath: path.join(assetsDir, `${baseName}-whiteboard.png`),
    ideaId: idea.id
  });
  const markdownWithImage = insertHeroImage(markdown, imageResult.imagePath, imageResult.error, markdownPath);
  writeMarkdown(markdownPath, markdownWithImage);
  logLine('markdown_written', { id: idea.id, markdownPath });
  const openUri = obsidianOpenUri(markdownPath);
  let rendered = { htmlPath: '', pdfPath: '', error: '' };
  const renderer = optionalEnv('PDF_RENDERER', 'chrome').toLowerCase();
  if (renderer === 'chrome') {
    try {
      const pdfPath = path.join(
        optionalEnv('PDF_OUTPUT_DIR', path.join('/tmp', 'feishu-idea-catcher-pdf')),
        `${baseName}.pdf`
      );
      rendered = renderPdfFromMarkdown(markdownPath, pdfPath);
      logLine('pdf_rendered', { id: idea.id, pdfPath: rendered.pdfPath });
    } catch (error) {
      logError('pdf_render_failed', error);
      rendered = {
        htmlPath: markdownPath.replace(/\.md$/i, '.html'),
        pdfPath: '',
        error: error.message || String(error)
      };
    }
  } else if (renderer === 'obsidian' || renderer === 'none') {
    rendered = {
      htmlPath: '',
      pdfPath: '',
      error: renderer === 'obsidian'
        ? '已启用 Obsidian 手动导出模式：请在 Obsidian 打开 Markdown 后使用导出 PDF。'
        : '已禁用自动 PDF 导出。'
    };
  } else {
    rendered = {
      htmlPath: '',
      pdfPath: '',
      error: `未知 PDF_RENDERER=${renderer}，已跳过 PDF 导出。`
    };
  }

  return {
    quickRecordOnly: false,
    title: displayTitle || shortName,
    listPath: path.join(ideaListDir, 'idea list.md'),
    markdownPath,
    obsidianUri: openUri,
    pdfPath: rendered.pdfPath || '',
    pdfError: rendered.error || '',
    htmlPath: rendered.htmlPath,
    assetsDir,
    visualPromptPath,
    imagePath: imageResult.imagePath || '',
    imageError: imageResult.error || '',
    research
  };
}

function insertHeroImage(markdown, imagePath, imageError = '', markdownPath = '') {
  if (!imagePath) {
    const note = imageError ? `\n\n> 白板图生成失败：${imageError}\n` : '';
    return `${markdown}${note}`;
  }
  const lines = String(markdown || '').split(/\r?\n/);
  const imageReference = markdownPath
    ? path.relative(path.dirname(markdownPath), imagePath).replace(/\\/g, '/')
    : imagePath;
  const imageBlock = ['', `![白板图](${imageReference})`, ''];
  if (lines[0]?.startsWith('# ')) {
    return [lines[0], ...imageBlock, ...lines.slice(1)].join('\n');
  }
  return [`![白板图](${imagePath})`, '', markdown].join('\n');
}

function normalizeReportTitle(markdown, title) {
  const safeTitle = String(title || '').trim();
  if (!safeTitle) return markdown;
  const lines = String(markdown || '').split(/\r?\n/);
  const firstHeading = lines.findIndex((line) => /^#\s+/.test(line));
  if (firstHeading === -1) return [`# ${safeTitle}`, '', ...lines].join('\n');
  lines[firstHeading] = `# ${safeTitle}`;
  return lines.join('\n');
}

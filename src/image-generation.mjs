import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { optionalEnv } from './env.mjs';
import { logLine, logError } from './logger.mjs';

export async function generateWhiteboardImage({ prompt, outputPath, ideaId }) {
  const engine = optionalEnv('IMAGE_ENGINE', 'codex').toLowerCase();
  if (engine === 'none') {
    return { imagePath: '', error: 'IMAGE_ENGINE=none，已跳过图片生成。' };
  }
  if (engine === 'codex') {
    return generateWithCodexImageGen({ prompt, outputPath, ideaId });
  }
  if (engine !== 'openai') {
    return { imagePath: '', error: `未知 IMAGE_ENGINE=${engine}，已跳过图片生成。` };
  }

  const apiKey = optionalEnv('OPENAI_API_KEY');
  if (!apiKey) {
    return { imagePath: '', error: '未配置 OPENAI_API_KEY，无法自动调用 image2/图片生成接口。' };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const model = optionalEnv('IMAGE_MODEL', 'gpt-image-1');
  const size = optionalEnv('IMAGE_SIZE', '1536x1024');
  logLine('image_generation_start', { id: ideaId, model, size, outputPath });

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        size
      }),
      signal: AbortSignal.timeout(Number(optionalEnv('IMAGE_TIMEOUT_MS', '300000')))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || response.statusText);
    }
    const b64 = payload?.data?.[0]?.b64_json;
    if (!b64) throw new Error('图片接口没有返回 b64_json。');
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    logLine('image_generation_done', { id: ideaId, imagePath: outputPath });
    return { imagePath: outputPath, error: '' };
  } catch (error) {
    logError('image_generation_failed', error);
    return { imagePath: '', error: error.message || String(error) };
  }
}

function generateWithCodexImageGen({ prompt, outputPath, ideaId }) {
  const codex = optionalEnv('CODEX_BIN', '/Applications/Codex.app/Contents/Resources/codex');
  if (!fs.existsSync(codex)) {
    return { imagePath: '', error: `Codex binary 不存在：${codex}` };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const startedAt = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-imagegen-'));
  const resultPath = path.join(tmpDir, 'result.txt');
  const tempImagePath = path.join(tmpDir, 'whiteboard.png');
  const imagePrompt = `Use $haonan-image-whiteboard.

请直接使用 Codex 内置 image_gen / image2 能力生成一张白板手绘信息图。

要求：
- 必须使用内置图片生成能力，不要使用 OpenAI API key，不要调用外部图片 API。
- 不要只输出提示词。
- 不要提前判断“非交互不可用”。必须先尝试调用 image_gen / image2。
- 生成图片后，优先把 PNG 保存或复制到这个临时路径：${tempImagePath}
- 如果不能直接保存到临时路径，请在 $HOME/.codex/generated_images 下定位本次最新图片，并复制到临时路径。
- 最终回复只写图片路径。

图片提示词如下：

${prompt}`;

  logLine('codex_image_start', { id: ideaId, outputPath });
  const args = [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '-C',
    process.cwd(),
    '-o',
    resultPath,
    imagePrompt
  ];
  const run = spawnSync(codex, args, {
    input: '',
    encoding: 'utf8',
    timeout: Number(optionalEnv('CODEX_IMAGE_TIMEOUT_MS', '900000')),
    maxBuffer: 30 * 1024 * 1024
  });

  if (fs.existsSync(tempImagePath)) {
    fs.copyFileSync(tempImagePath, outputPath);
    logLine('codex_image_done', { id: ideaId, imagePath: outputPath, tempImagePath });
    return { imagePath: outputPath, error: '' };
  }

  if (fs.existsSync(outputPath)) {
    logLine('codex_image_done', { id: ideaId, imagePath: outputPath });
    return { imagePath: outputPath, error: '' };
  }

  const newest = findNewestGeneratedImage(startedAt);
  if (newest) {
    fs.copyFileSync(newest, outputPath);
    logLine('codex_image_copied_from_generated', { id: ideaId, source: newest, imagePath: outputPath });
    return { imagePath: outputPath, error: '' };
  }

  const response = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8') : '';
  const error = [
    run.error?.message || '',
    run.signal ? `signal=${run.signal}` : '',
    run.status !== 0 && run.status !== null ? `status=${run.status}` : '',
    `args=${JSON.stringify(args)}`,
    String(run.stderr || '').slice(0, 1000),
    String(run.stdout || '').slice(0, 1000),
    String(response || '').slice(0, 1000)
  ].filter(Boolean).join('\n');
  const finalError = error || 'Codex image generation did not produce a file.';
  logLine('codex_image_failed', { id: ideaId, error: finalError.slice(0, 1200) });
  return { imagePath: '', error: finalError };
}

function findNewestGeneratedImage(startedAt) {
  const root = path.join(os.homedir(), '.codex', 'generated_images');
  if (!fs.existsSync(root)) return '';
  const candidates = [];
  walk(root, (filePath) => {
    if (!/\.(png|webp|jpe?g)$/i.test(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs >= startedAt - 5000) candidates.push({ filePath, mtimeMs: stat.mtimeMs });
  });
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath || '';
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, visit);
    else if (entry.isFile()) visit(fullPath);
  }
}

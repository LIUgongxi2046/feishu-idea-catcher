import { optionalEnv } from './env.mjs';

export function buildWhiteboardPrompt({ ideaText, shortName, displayTitle, reportMarkdown = '' }) {
  const title = displayTitle || shortName;
  const brief = extractIdeaBrief(reportMarkdown);
  const summary = summarizeReport(reportMarkdown);
  const signature = optionalEnv('WHITEBOARD_SIGNATURE', '').trim();
  const signatureRule = signature
    ? `Place an unframed black handwritten signature "${signature}" in the lower-right corner.`
    : 'Do not add a personal signature, logo, watermark, or author name.';
  return `Create a clean whiteboard sketch style visual explainer.

## Image Specifications
- Type: whiteboard report infographic
- Aspect ratio: 16:9
- Language: Chinese
- Style: whiteboard sketch, hand-drawn marker illustration

## Core Message
把“${title}”这个产品/想法本身讲清楚：目标用户是谁、解决什么痛点、核心体验是什么、最大风险在哪里、下一步怎么验证。

## Content
- Title: ${title}
- Subtitle: ${brief.verdict || '先做窄场景 MVP，验证真实使用频率'}
- Target users: ${brief.users || '高频遇到这个问题、愿意改变流程的人'}
- Pain points: ${brief.pains || '信息零散、反馈慢、难以形成可执行判断'}
- Main scene or central mechanism: ${brief.mechanism || '用户在真实场景中输入任务或材料，系统提炼关键线索，形成结构化判断、反馈和下一步动作。'}
- Key points: ${brief.keyPoints || '目标用户；真实痛点；核心闭环；差异化；风险边界；下一步验证'}
- Process or relationship: ${brief.process || '输入材料 -> 提炼线索 -> 形成判断 -> 反馈复盘 -> 下一步行动'}
- Risks or warnings: ${brief.risks || '需求不高频；结果不可验证；隐私和合规边界；过早做大平台'}
- Mitigations or principles: ${brief.mitigations || '先做教学/低风险场景；人工复核；小样本验证；保留边界说明'}
- Bottom takeaway: ${brief.takeaway || '先让一个具体用户在 10 分钟内完成一次可感知的任务。'}

## Report Context
${summary}

## Layout
使用“想法一图看懂”的白板报告布局：
- 顶部：短标题“${title}”和一句结论。
- 左侧：目标用户和真实痛点，用人物、病例/文档/任务图标表达。
- 中间：核心体验闭环，用 4-5 步机制图表达“输入、提炼、判断、反馈、复盘”。
- 右侧：最大风险和边界，用警示三角和盾牌表达。
- 底部：最小 MVP 路线和下一步验证动作。

Important: 这张图解释的是“${title}”这个想法，不是解释飞书机器人、Codex、Obsidian、PDF 回传或本自动化项目。不要画聊天机器人到 Obsidian 的流程，除非原始想法本身就是这个流程。

## Visual Style
Use a clean pure white whiteboard background.
Use thin black hand-drawn marker lines with subtle wobble.
Use simple doodle icons, stick-figure characters, rounded boxes, and wavy arrows.
Use an airy, organized multi-zone composition with generous whitespace.
Use blue, green, and orange marker accents to separate sections and hierarchy.
Use blue for structure, technology, data, and system boundaries.
Use green for process, progress, positive outcomes, and completed steps.
Use orange for key points, reminders, decisions, and takeaways.
Use red only sparingly for severe risks or critical failure points.
All text should look hand-lettered and be large enough to read.
${signatureRule}

## Text Rules
Use short Chinese headings, labels, and compact bullet phrases.
No long paragraphs.
Main title must be prominent.
Main title must be short and readable; do not use the full original idea sentence as visible title.
Labels must be readable.

## Negative Rules
No photorealism. No 3D rendering. No glossy gradients. No stock illustration.
No perfect geometric shapes. No computer fonts. No dense paragraphs.
No tiny unreadable text. No complex background. No decorative clutter.
No heavy black outlines. No dense marker fill. No colored background blocks.
No framed signature, logo-like signature, stamp-like signature, or watermark.`;
}

function extractIdeaBrief(markdown) {
  const conclusion = extractSection(markdown, '0. 一句话结论');
  const what = extractSection(markdown, '1. 这个想法到底是什么');
  const competitors = extractSection(markdown, '2. 是否已经有人在做');
  const route = extractSection(markdown, '4. 最小实现路线');
  const risks = extractSection(markdown, '5. 风险与失败信号');
  const next = extractSection(markdown, '6. 下一步 3 个动作');
  return {
    verdict: firstUsefulLine(conclusion),
    users: findLineBlock(what, ['目标用户', '用户']),
    pains: findLineBlock(what, ['真实痛点', '痛点']),
    mechanism: findLineBlock(what, ['10 分体验', '体验', '场景']),
    keyPoints: compactPhrases([firstUsefulLine(what), findLine(competitors, ['差异化', '结论']), firstUsefulLine(route)]),
    process: inferProcess(what, route),
    risks: compactPhrases(linesFrom(risks, 4)),
    mitigations: compactPhrases(linesFrom(route, 3)),
    takeaway: firstUsefulLine(next)
  };
}

function summarizeReport(markdown) {
  const text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]+]\([^)]*\)/g, '')
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 600) || '暂无报告摘要，请基于原始想法生成一张概念清晰的白板图。';
}

function extractSection(markdown, headingText) {
  const lines = String(markdown || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${headingText}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

function firstUsefulLine(text) {
  return linesFrom(text, 1)[0] || '';
}

function linesFrom(text, limit = 3) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, '').replace(/\*\*/g, '').trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!['))
    .slice(0, limit);
}

function findLine(text, keywords) {
  const line = linesFrom(text, 20).find((item) => keywords.some((keyword) => item.includes(keyword)));
  return line ? line.replace(/^.+?[：:]/, '').trim() : '';
}

function findLineBlock(text, keywords) {
  const lines = linesFrom(text, 30);
  const index = lines.findIndex((item) => keywords.some((keyword) => item.includes(keyword)));
  if (index === -1) return '';
  const inline = lines[index].replace(/^.+?[：:]/, '').trim();
  if (inline) return inline;
  return lines.slice(index + 1, index + 4)
    .filter((line) => !/暂不优先|不优先|不建议|暂缓|排除/.test(line))
    .map((line) => line.replace(/^.+?[：:]/, '').trim())
    .filter(Boolean)
    .join('；');
}

function compactPhrases(items) {
  const phrases = items.flatMap((item) => Array.isArray(item) ? item : [item])
    .map((item) => String(item || '').replace(/^.+?[：:]/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return phrases.join('；');
}

function inferProcess(what, route) {
  const fromExperience = findLine(what, ['10 分体验', '体验']);
  if (fromExperience) return fromExperience;
  const steps = linesFrom(route, 3).map((line) => line.replace(/^第\s*\d+\s*步[：:]/, '').trim());
  return steps.length ? steps.join(' -> ') : '';
}

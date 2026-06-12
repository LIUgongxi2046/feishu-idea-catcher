import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { optionalEnv } from './env.mjs';
import { logLine } from './logger.mjs';

const PLAN_CEO_REVIEW_SECTIONS = [
  '架构评审',
  '错误与救援地图',
  '安全与威胁模型',
  '数据流与交互边界场景',
  '代码质量评审',
  '测试评审',
  '性能评审',
  '可观测性与可调试性评审',
  '部署与发布评审',
  '长期演进评审',
  '设计与体验评审'
];

export function buildReportPrompt({ ideaText, shortName, displayTitle, research }) {
  const title = displayTitle || shortName;
  const persona = optionalEnv('REPORT_PERSONA', '架构评审助手');
  return `你是“${persona}”，请基于下面这个灵感生成一份中文 CEO Review 短报告。

要求：
- 只输出 Markdown，不要输出解释过程。
- 报告适合导出为 2-4 页 PDF。
- 必须包含 0 到 6 的固定章节。
- 全文必须使用中文。除产品名、公司名、开源库名、论文名、URL、必要英文缩写外，不要输出英文标题、英文段落或英文表头。
- 这是基于 garrytan/gstack plan-ceo-review 的“非交互压缩版”。原 skill 要求逐项提问确认；本自动化场景不能停下来提问，所以请把问题压缩成“发现 / 建议 / 为什么 / 风险等级”，不要冒充原始交互评审已经完成。
- CEO Review 必须覆盖 plan-ceo-review 的 11 个 section：${PLAN_CEO_REVIEW_SECTIONS.join('；')}。
- 如果启用了 web search，请直接进行轻量竞品/先行者扫描，找 3-5 个真实相关产品/项目/论文/开源库/网页，保留 URL。若无法联网或搜索失败，明确写“Codex 搜索失败/未启用”，不要编造。
- 如果给定 research 数据为空，可以依赖 Codex web search；如果 web search 不可用，才基于假设给出需人工补查的判断。
- 语气要像一个严谨但务实的创业/产品/技术评审，不要写空话。
- 不要输出“附录”。不要输出白板图提示词。图片由外部 image2 阶段生成并插入。
- 尽量避免复杂 Markdown 表格；如必须比较竞品，用短列表代替表格，防止手机 PDF 表格变形。
- 报告 H1 必须使用“提炼标题”，不要直接使用原始想法长句。
- 提炼标题必须短、清楚、像产品/选题名，建议 6-12 个中文字，最多不超过 14 个中文字。
- 重点内容要加粗：一句话结论、最大原因、目标用户、真实痛点、差异化判断、CEO Review 的关键建议、风险等级、停止信号、下一步动作关键词。
- 每个章节开头优先给出 1 句加粗判断，再展开短列表。

提炼标题：${title}
备用短名：${shortName}
原始想法：${ideaText}

竞品/先行者扫描数据：
${JSON.stringify(research, null, 2)}

固定章节：
# ${title}

## 0. 一句话结论
写清楚：值得 / 暂缓 / 不建议，以及最大原因。

## 1. 这个想法到底是什么
覆盖：用户场景、目标用户、真实痛点、成功后的 10 分体验。

## 2. 是否已经有人在做
覆盖：搜索关键词、已有项目清单、界面/产品形态观察、差异化判断、结论。
每个项目都要保留 URL。如果有 screenshot 字段，写成 Markdown 图片。

## 3. CEO Review
按 11 个中文小标题输出，每个小标题 2-4 条短评：
1. 架构评审
2. 错误与救援地图
3. 安全与威胁模型
4. 数据流与交互边界场景
5. 代码质量评审
6. 测试评审
7. 性能评审
8. 可观测性与可调试性评审
9. 部署与发布评审
10. 长期演进评审
11. 设计与体验评审

## 4. 最小实现路线
分三步：先跑通闭环、补稳定性、补体验/模板/教程化。

## 5. 风险与失败信号
覆盖：技术、合规、产品、时间成本，以及停止投入信号。

## 6. 下一步 3 个动作
只列 3 个最小、可执行、可验证的动作。`;
}

export function generateReport(input) {
  const engine = optionalEnv('REPORT_ENGINE', 'template').toLowerCase();
  if (engine !== 'codex') {
    logLine('report_template_used', {
      idea: input.shortName,
      engine
    });
    return structuredReport(input);
  }
  return generateReportWithCodex(input);
}

export function generateReportWithCodex(input) {
  const codex = optionalEnv('CODEX_BIN', '/Applications/Codex.app/Contents/Resources/codex');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-report-'));
  const outputPath = path.join(tmpDir, 'report.md');
  const prompt = buildReportPrompt(input);
  const args = [];
  if (optionalEnv('CODEX_ENABLE_WEB_SEARCH', '1') !== '0') args.push('--search');
  args.push(
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '-C',
    process.cwd(),
    '-o',
    outputPath
  );
  args.push('-');
  logLine('codex_report_start', {
    idea: input.shortName,
    args: args.filter((arg) => arg !== input?.ideaText)
  });

  const run = spawnSync(codex, args, {
    input: prompt,
    encoding: 'utf8',
    timeout: Number(optionalEnv('CODEX_REPORT_TIMEOUT_MS', '1200000')),
    maxBuffer: 20 * 1024 * 1024
  });

  if (run.status === 0 && fs.existsSync(outputPath)) {
    const report = fs.readFileSync(outputPath, 'utf8').trim();
    if (report) {
      logLine('codex_report_success', {
        idea: input.shortName,
        bytes: Buffer.byteLength(report)
      });
      return report;
    }
  }

  logLine('codex_report_fallback', {
    idea: input.shortName,
    status: run.status,
    signal: run.signal || '',
    error: run.error?.message || '',
    stderr: String(run.stderr || '').slice(0, 1000),
    stdout: String(run.stdout || '').slice(0, 1000)
  });
  return structuredReport(input);
}

export function structuredReport({ ideaText, shortName, displayTitle, research }) {
  const title = displayTitle || shortName;
  const results = research?.results || [];
  const queries = research?.queries || [];
  const medicalLike = /医|病|病例|患者|临床|诊断|治疗|健康|护理|药/.test(ideaText);
  const targetHint = medicalLike
    ? '医学生、年轻医生、带教老师或需要结构化临床思维训练的人'
    : '高频遇到这个问题、愿意为了节省时间或提升质量而改变流程的人';
  const painHint = medicalLike
    ? '临床知识和真实病例之间存在断层，学习者缺少低风险、可反复练习、可反馈的训练环境。'
    : '当前流程可能依赖人工整理、临时记忆或多个工具拼接，导致执行成本高、反馈慢。';
  const tenMinuteExperience = medicalLike
    ? '用户输入一个病例或主题，系统给出鉴别诊断路径、关键追问、检查选择和思维盲点反馈。'
    : '用户输入一个真实任务，系统在 10 分钟内给出可执行结果、下一步动作和可复用记录。';
  const verdict = results.length >= 3
    ? '值得小步验证，但要把切入点做窄'
    : '值得做一次极小 MVP 验证';
  const maxReason = results.length >= 3
    ? '需求大概率存在，但已有玩家说明通用方案会拥挤，必须赢在更具体的场景。'
    : '当前还没有足够竞品证据证明赛道拥挤，可以先用最小闭环验证真实使用频率。';
  const resultLines = results.length
    ? results.map((item, index) => {
        const shot = item.screenshot ? `\n\n![${item.title}](${item.screenshot})` : '';
        return `${index + 1}. [${item.title}](${item.url})
   - 类型：${item.type || '未分类'}
   - 它解决什么：${item.summary || '暂无摘要'}
   - 相似点：${item.similarity || '需要人工打开页面复核'}
   - 可借鉴点：${item.takeaway || '入口、核心流程、定价和目标用户值得继续观察'}${shot}`;
      }).join('\n')
    : `未获得可用竞品结果。${research?.error || ''}`;
  const researchConclusion = results.length >= 3
    ? '已验证需求存在，但需要进一步比较产品形态和商业模式。'
    : (research?.provider === 'not_configured'
      ? '竞品扫描未启用，需要配置 Brave、Bing 或 Tavily 官方搜索 API 后补查。'
      : '尚无明显强相关产品，仍需人工复核关键词是否准确。');

  return `# ${title}

## 0. 一句话结论

- **值不值得继续：${verdict}**
- **最大原因：${maxReason}**

## 1. 这个想法到底是什么

- 原始想法：${ideaText}
- **用户场景：**用户在一个具体任务中遇到阻塞，希望把零散信息快速整理成可判断、可行动的结果。
- **目标用户：**${targetHint}。
- **真实痛点：**${painHint}
- **成功后的 10 分体验：**${tenMinuteExperience}

## 2. 是否已经有人在做

- 搜索关键词：${queries.length ? queries.join(' / ') : '未生成搜索词'}
- 扫描结果：

${resultLines}

- 界面/产品形态观察：当前结果不足时，不根据模型记忆编造竞品；有结果时优先观察入口、核心流程、定价/商业模式和目标用户。
- **差异化判断：**先判断能否做得更窄、更快、更贴近本地使用场景，而不是一开始做成大而全平台。
- **结论：${researchConclusion}**

## 3. CEO Review

> 注：这是 plan-ceo-review 的非交互压缩版。原 skill 要求逐项提问确认；自动化报告只保留评审维度和风险提示。

### 3.1 架构评审
- 系统边界：先拆成输入、队列、分析、存储、回传五段，避免把长任务绑在消息入口上。
- 数据流：飞书消息进入队列，本地 worker 处理后写 Obsidian，再导出 PDF 回传。
- 10x 风险：队列积压、AI 调用变慢、PDF 导出排队会先暴露。

### 3.2 错误与救援地图
- 主要失败：飞书 token 超时、队列入队失败、AI 生成超时、PDF 导出失败、文件回传失败。
- 兜底动作：每个阶段都要保留日志和产物路径，允许重试而不是丢消息。

### 3.3 安全与威胁模型
- 敏感面：消息内容、医疗/个人信息、飞书密钥、Codex 权限、本地文件路径。
- 建议：坚持官方 API；密钥只放 env；报告里避免泄露 token、完整隐私信息和不必要的本地路径。

### 3.4 数据流与交互边界场景
- 边界：空消息、重复消息、超长语音转文字、网络中断、重复触发。
- 建议：用 message_id 去重，超长内容截断摘要并保留原文。

### 3.5 代码质量评审
- MVP 阶段不要抽象成平台；先让单用户单队列稳定。
- 模块边界建议保持：listener、queue worker、report、pdf、feishu client。

### 3.6 测试评审
- 必测：飞书入队、队列 claim、重复消息、报告生成失败、PDF 缺失、文件回传失败。
- 验收：一条真实想法能从飞书进入 Obsidian 并收到 PDF。

### 3.7 性能评审
- 慢路径：Codex 搜索和图片生成最慢，必须放后台。
- 队列策略：一次只处理少量任务，避免多个 Chrome/Codex 进程抢资源。

### 3.8 可观测性与可调试性评审
- 必要日志：message_id、idea id、阶段、错误摘要、markdown/pdf/assets 路径。
- 排查入口：state 日志和 Obsidian 产物目录必须能还原一次处理。

### 3.9 部署与发布评审
- 上线：先只给自己使用，LaunchAgent 保持 listener 和 worker 常驻。
- 回滚：停 worker 即可停止长任务；停 listener 即可停止接收新消息。

### 3.10 长期演进评审
- 一年后最容易变复杂的是多人权限、报告模板、搜索质量和成本控制。
- 平台化机会：同一队列可扩展成文章选题、周报、病例整理等自动化入口。

### 3.11 设计与体验评审
- 用户体验：聊天入口必须低摩擦；收到消息后要快速确认“已入队”。
- 输出体验：PDF 首屏要能看懂结论，图示要辅助理解而不是装饰。

## 4. 最小实现路线

1. 第 1 步：不用追求完美，先跑通从飞书消息到 Obsidian 记录、Markdown 报告、PDF 回传的闭环。
2. 第 2 步：补稳定性和错误处理，包括去重、超时、重试、日志、搜索失败兜底和 PDF 失败提示。
3. 第 3 步：补体验、模板、自动化和教程化，包括报告模板选择、语音转文字、竞品截图和演示素材。

## 5. 风险与失败信号

- 技术风险：外部 API、浏览器截图、PDF 生成任一环节可能不稳定。
- 合规风险：必须坚持官方 API，不碰个人客户端自动化。
- 产品风险：如果用户没有持续发送想法，或报告不能帮助判断下一步，自动化价值会下降。
- 时间成本风险：不要在未验证需求前做复杂平台。
- 停止信号：连续多次真实使用后，报告无法指导下一步行动，或用户宁愿手动记录也不愿使用入口。

## 6. 下一步 3 个动作

1. 把这个想法改写成一句可验证问题：谁在什么场景下，因为它节省了多少时间或降低了什么风险。
2. 找 3 个最像的替代方案或竞品，记录它们的入口、核心流程和收费方式。
3. 做一个只服务单一场景的最小样例，让一个真实用户完成一次完整任务。`;
}

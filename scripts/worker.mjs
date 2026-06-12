#!/usr/bin/env node
import { loadDotEnv, optionalEnv } from '../src/env.mjs';
import { fetchPendingIdeas, markDone, markFailed } from '../src/cloud-api.mjs';
import { processIdea } from '../src/process-idea.mjs';
import { sendFeishuMessage, sendReportToFeishu, getTenantAccessToken } from '../src/feishu-client.mjs';
import { Upstash, claimPendingIdeas, markIdeaDone, markIdeaFailed } from '../src/upstash.mjs';

loadDotEnv();

const once = process.argv.includes('--once');
const intervalSeconds = Number(optionalEnv('WORKER_INTERVAL_SECONDS', '180'));
const queueSource = optionalEnv('WORKER_QUEUE_SOURCE', 'upstash').toLowerCase();
const redis = queueSource === 'upstash' ? new Upstash() : null;

async function runOnce() {
  const ideas = await fetchIdeas(3);
  if (!ideas.length) {
    console.log(`[${new Date().toISOString()}] no pending ideas`);
    return;
  }

  for (const idea of ideas) {
    console.log(`[${new Date().toISOString()}] processing ${idea.id}: ${idea.text}`);
    try {
      const result = await processIdea(idea);
      let feishuResult = { skipped: true };

      if (result.quickRecordOnly) {
        feishuResult = await sendQuickRecordAck(idea, result);
      } else {
        feishuResult = await sendReportToFeishu({
          chatId: idea.chat_id,
          pdfPath: result.pdfPath,
          markdownPath: result.markdownPath,
          title: result.title
        });
      }

      await markIdeaDoneForSource(idea.id, {
        title: result.title,
        quickRecordOnly: result.quickRecordOnly,
        listPath: result.listPath,
        markdownPath: result.markdownPath || '',
        obsidianUri: result.obsidianUri || '',
        pdfPath: result.pdfPath || '',
        pdfError: result.pdfError || '',
        htmlPath: result.htmlPath || '',
        assetsDir: result.assetsDir || '',
        visualPromptPath: result.visualPromptPath || '',
        imagePath: result.imagePath || '',
        imageError: result.imageError || '',
        feishu: feishuResult
      });
      console.log(`[${new Date().toISOString()}] done ${idea.id}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] failed ${idea.id}`, error);
      await markIdeaFailedForSource(idea.id, error);
    }
  }
}

async function fetchIdeas(limit) {
  if (queueSource === 'upstash') return claimPendingIdeas(redis, limit);
  return fetchPendingIdeas(limit);
}

async function markIdeaDoneForSource(id, patch) {
  if (queueSource === 'upstash') return markIdeaDone(redis, id, patch);
  return markDone(id, patch);
}

async function markIdeaFailedForSource(id, error) {
  if (queueSource === 'upstash') return markIdeaFailed(redis, id, error);
  return markFailed(id, error);
}

async function sendQuickRecordAck(idea, result) {
  if (!idea.chat_id) return { skipped: true, reason: 'chat_id missing' };
  const token = await getTenantAccessToken();
  const message = await sendFeishuMessage(idea.chat_id, 'text', {
    text: `已快速记录：${result.title}\n${result.listPath}`
  }, token);
  return { skipped: false, message };
}

async function main() {
  if (once) {
    await runOnce();
    return;
  }

  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] worker loop error`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

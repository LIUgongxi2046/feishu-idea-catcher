import { optionalEnv } from './env.mjs';

export function buildSearchQueries(ideaText) {
  const text = String(ideaText || '').trim();
  const compact = text.replace(/\s+/g, ' ').slice(0, 80);
  return [
    compact,
    `${compact} 工具 AI 自动化 工作流`,
    `${compact} product startup AI automation workflow`
  ];
}

export async function researchCompetitors(ideaText, options = {}) {
  const provider = (options.provider || optionalEnv('SEARCH_PROVIDER', '')).toLowerCase();
  const queries = buildSearchQueries(ideaText);
  const output = {
    provider: provider || 'not_configured',
    queries,
    results: [],
    error: ''
  };

  try {
    if (provider === 'brave') {
      output.results = await braveSearch(queries);
    } else if (provider === 'bing') {
      output.results = await bingSearch(queries);
    } else if (provider === 'tavily') {
      output.results = await tavilySearch(queries);
    } else {
      output.error = '未配置 SEARCH_PROVIDER。请配置 Brave、Bing 或 Tavily 官方搜索 API 后启用竞品扫描。';
    }
  } catch (error) {
    output.error = `竞品扫描失败：${error.message}`;
  }

  output.results = dedupeResults(output.results).slice(0, 5);
  return output;
}

async function braveSearch(queries) {
  const token = optionalEnv('BRAVE_SEARCH_API_KEY');
  if (!token) throw new Error('BRAVE_SEARCH_API_KEY is missing');
  const results = [];
  for (const query of queries) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    const response = await fetch(url, {
      headers: {
        'x-subscription-token': token,
        accept: 'application/json'
      }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || response.statusText);
    for (const item of payload?.web?.results || []) {
      results.push(normalizeResult(item.title, item.url, item.description));
    }
  }
  return results;
}

async function bingSearch(queries) {
  const token = optionalEnv('BING_SEARCH_API_KEY');
  if (!token) throw new Error('BING_SEARCH_API_KEY is missing');
  const endpoint = optionalEnv('BING_SEARCH_ENDPOINT', 'https://api.bing.microsoft.com/v7.0/search');
  const results = [];
  for (const query of queries) {
    const url = new URL(endpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    const response = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': token }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.message || response.statusText);
    for (const item of payload?.webPages?.value || []) {
      results.push(normalizeResult(item.name, item.url, item.snippet));
    }
  }
  return results;
}

async function tavilySearch(queries) {
  const token = optionalEnv('TAVILY_API_KEY');
  if (!token) throw new Error('TAVILY_API_KEY is missing');
  const results = [];
  for (const query of queries) {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: token,
        query,
        search_depth: 'basic',
        max_results: 5
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || response.statusText);
    for (const item of payload?.results || []) {
      results.push(normalizeResult(item.title, item.url, item.content));
    }
  }
  return results;
}

function normalizeResult(title, url, snippet = '') {
  return {
    title: String(title || '').trim(),
    url: String(url || '').trim(),
    type: inferType(url, title, snippet),
    summary: String(snippet || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    similarity: '',
    takeaway: '',
    screenshot: ''
  };
}

function dedupeResults(results) {
  const seen = new Set();
  const unique = [];
  for (const result of results || []) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    unique.push(result);
  }
  return unique;
}

function inferType(url = '', title = '', snippet = '') {
  const haystack = `${url} ${title} ${snippet}`.toLowerCase();
  if (/github\.com|gitlab\.com|open source|开源/.test(haystack)) return '开源';
  if (/arxiv|pubmed|paper|论文|journal/.test(haystack)) return '论文';
  if (/youtube|bilibili|video|视频/.test(haystack)) return '视频';
  if (/pricing|product|app|platform|solution|官网|产品/.test(haystack)) return '产品';
  if (/company|about|公司/.test(haystack)) return '公司';
  return '网页';
}

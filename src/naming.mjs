export function formatDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    ymd: `${parts.year}${parts.month}${parts.day}`,
    dotted: `${Number(parts.year)}.${Number(parts.month)}.${Number(parts.day)}`,
    iso: `${parts.year}-${parts.month}-${parts.day}`
  };
}

export function ideaShortName(text, maxLength = 16) {
  const cleaned = String(text || '')
    .replace(/快速记录[，, ]*不用分析/g, '')
    .replace(/[“”"']/g, '')
    .replace(/[<>:"/\\|?*\n\r\t]/g, '')
    .replace(/\s+/g, '')
    .trim();
  const short = cleaned.slice(0, maxLength) || '未命名想法';
  return short.replace(/[.。]+$/g, '');
}

export function ideaDisplayTitle(text, maxLength = 14) {
  const cleaned = String(text || '')
    .replace(/快速记录[，, ]*不用分析/g, '')
    .replace(/^(我想做一个|我想做款|想做一个|想做款|做一个|做款|一个|一款)/, '')
    .replace(/(的)?(工具|应用|系统|平台|产品|助手|机器人|小程序|网站|网页|app|APP)$/i, '')
    .replace(/[“”"']/g, '')
    .replace(/[<>:"/\\|?*\n\r\t]/g, '')
    .replace(/\s+/g, '')
    .trim();
  const compact = cleaned || ideaShortName(text, maxLength);
  if (compact.length <= maxLength) return compact || '未命名想法';

  if (/医学生|医学|医生|临床|病例|病历/.test(compact) && /诊断思维|临床推理|推理/.test(compact)) {
    return compact.includes('学习') ? '诊断思维训练' : '诊断思维图谱';
  }

  if (
    /医学/.test(compact)
    && /知识/.test(compact)
    && /数据/.test(compact)
    && /模型/.test(compact)
    && /测评|评测/.test(compact)
    && /汇聚|聚合|整合/.test(compact)
  ) {
    return '医学AI资产汇聚与评测平台';
  }

  const keywords = [
    '诊断思维', '病例学习', '病历学习', '病历整理', '病例整理', '临床推理', '医学学习',
    '竞品分析', '灵感评审', '知识图谱', '工作流', '自动化', '复盘', '训练'
  ];
  const hits = keywords.filter((keyword) => compact.includes(keyword));
  if (hits.length >= 2) return hits.slice(0, 2).join('');
  if (hits.length === 1) return hits[0];

  return compact.slice(0, maxLength).replace(/[的地得和与及、，。,.]+$/g, '') || '未命名想法';
}

export function safeFileName(name) {
  return String(name || '未命名')
    .replace(/[<>:"/\\|?*\n\r\t]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function shouldQuickRecordOnly(text) {
  return /快速记录\s*[，, ]*\s*不用分析/.test(String(text || ''));
}

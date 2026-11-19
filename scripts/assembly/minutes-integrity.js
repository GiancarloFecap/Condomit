(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CondomitMinutesIntegrity = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MONEY = /(?:R\$\s*|\b(?:valor|custo|orçamento|preço|despesa|investimento|gasto|proposta)\s+(?:de\s+|estimad[oa]\s+em\s+)?)(\d[\d.,]*(?:\s*(?:milh(?:ão|ões)|mil|bilh(?:ão|ões)))?)(?:\s*(?:reais|real))?|\b(\d[\d.,]*(?:\s*(?:milh(?:ão|ões)|mil|bilh(?:ão|ões))))\s+(?:reais|real)\b/giu;
  const PERCENT = /\b(\d{1,3}(?:[.,]\d+)?)\s*%/g;
  const term = value => String(value || '').replace(/\s+/g, ' ').trim();
  function amount(value) {
    let s = term(value).toLowerCase();
    const factor = /bilh/.test(s) ? 1e9 : /milh/.test(s) ? 1e6 : /\bmil\b/.test(s) ? 1e3 : 1;
    s = s.replace(/\s*(?:bilh(?:ão|ões)|milh(?:ão|ões)|mil)\b/g, '').replace(/[^\d.,]/g, '');
    if (!s) return null;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lastComma > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (lastDot > -1 && /\.\d{3}(?:\.|$)/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s) * factor;
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  function factList(source, opts = {}) {
    const rows = Array.isArray(source) ? source : [{transcript:String(source || '')}];
    const output = new Map();
    for (const row of rows) {
      const text = String(row?.transcript ?? row?.text ?? '');
      if (!text) continue;
      MONEY.lastIndex = 0;
      for (const match of text.matchAll(MONEY)) {
        const numeric = amount(match[1] || match[2]);
        if (numeric === null) continue;
        const key = `money:${numeric}`;
        if (!output.has(key)) output.set(key,{type:'money',value:numeric,found:term(match[0]).slice(0,95),source_id:row?.id ?? null});
      }
      if (opts.percentages !== false) {
        PERCENT.lastIndex = 0;
        for (const match of text.matchAll(PERCENT)) {
          const numeric = Number(match[1].replace(',', '.'));
          if (!Number.isFinite(numeric)) continue;
          const key = `percent:${numeric}`;
          if (!output.has(key)) output.set(key,{type:'percent',value:numeric,found:match[0],source_id:row?.id ?? null});
        }
      }
    }
    return [...output.values()];
  }
  function missingFacts(original, drafted) {
    const sourceFacts = factList(original);
    if (!sourceFacts.length) return [];
    const renderedFacts = factList(String(drafted || ''));
    const found = new Set(renderedFacts.map(f=>`${f.type}:${f.value}`));
    return sourceFacts.filter(f=>!found.has(`${f.type}:${f.value}`));
  }
  function describeMissing(facts) {
    return facts.slice(0,7).map(f=>f.type==='money' ? `valor ${f.found}` : `percentual ${f.found}`).join('; ');
  }
  return {amount,factList,missingFacts,describeMissing};
});

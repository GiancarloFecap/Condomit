'use strict';

const { categorias } = require('./condominio.base');

const LIMITE_PROVEDOR = 500;
const FRACAO_SEGURA = 0.85;
const MAX_TERMOS = 100;

function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}
function limpar(valor) {
  return typeof valor === 'string' ? valor.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}
function estimarTokens(texto) {
  // Margem extra por termo: o tokenizador real pertence ao Deepgram.
  return Math.ceil(Array.from(String(texto)).length / 3.5) + 1;
}
function limiteValido(raw) {
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1 ? Math.min(num, LIMITE_PROVEDOR) : LIMITE_PROVEDOR;
}
function buildKeyterms(contexto = {}, opcoes = {}) {
  const limiteConfigurado = limiteValido(opcoes.tokenLimit ?? process.env.DEEPGRAM_KEYTERM_TOKEN_LIMIT ?? LIMITE_PROVEDOR);
  const orcamento = Math.floor(limiteConfigurado * FRACAO_SEGURA);
  const included = [];
  const discarded = [];
  const seen = new Set();
  let tokens = 0;
  const add = (raw, categoria, critical = false) => {
    const termo = limpar(raw);
    if (!termo) return;
    const key = normalizar(termo);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const size = estimarTokens(termo);
    const item = { termo, categoria, critico: critical, tokensEstimados: size };
    if (included.length < MAX_TERMOS && tokens + size <= orcamento) {
      included.push(item);
      tokens += size;
    } else {
      discarded.push({ ...item, motivo: included.length >= MAX_TERMOS ? 'limite_termos' : 'orcamento_tokens' });
    }
  };
  add(contexto.nomeCondominio, 'Condomínio', true);
  const moradores = Array.isArray(contexto.moradores) ? contexto.moradores.slice(0, 400) : [];
  for (const morador of moradores) {
    const nome = limpar(typeof morador === 'string' ? morador : morador?.nome);
    if (!nome) continue;
    add(nome, 'Moradores', true);
    const partes = nome.split(' ').filter(p => p.length > 1 && !/^(?:de|da|do|das|dos|e)$/i.test(p));
    if (partes.length > 1) {
      add(partes[0], 'Moradores', true);
      add(partes[partes.length - 1], 'Moradores', true);
    }
    add(morador?.apelido, 'Moradores', true);
  }
  for (const empresa of (Array.isArray(contexto.empresas) ? contexto.empresas.slice(0, 100) : [])) add(empresa, 'Empresas', true);
  const pauta = Array.isArray(contexto.pauta) ? contexto.pauta : [];
  const pautaTexto = pauta.map(x => `${x?.titulo || ''} ${x?.descricao || ''}`).join(' ');
  // Valores são destacados somente quando documentados na pauta; não presumir quantias.
  const valores = pautaTexto.match(/(?:R\$\s*\d[\d.,]*|\b\d[\d.,]*\s+(?:mil\s+)?reais\b)/giu) || [];
  for (const valor of valores.slice(0, 20)) add(valor, 'Valores da pauta', true);
  if (contexto.tipoAssembleia === 'AGE') add('assembleia geral extraordinária', 'Assembleia', true);
  else if (contexto.tipoAssembleia === 'AGO') add('assembleia geral ordinária', 'Assembleia', true);
  // Endereços completos não são enviados para não ampliar desnecessariamente os dados pessoais.
  const searchable = normalizar(pautaTexto);
  const active = categorias.filter(c => c.gatilhos.some(g => searchable.includes(normalizar(g))));
  const core = categorias.filter(c => ['Assembleia', 'Cargos e órgãos', 'Finanças'].includes(c.nome));
  // Uma cota inicial garante presença das três categorias sem bloquear a pauta da reunião.
  for (const category of core) for (const termo of category.termos.slice(0, 8)) add(termo, category.nome, true);
  const contextuais = active.filter(c => !core.includes(c)).sort((a, b) => a.prioridade - b.prioridade);
  for (const category of contextuais) for (const termo of category.termos.slice(0, 8)) add(termo, category.nome, true);
  // Intercala as categorias ativas para que uma pauta extensa não exclua segurança ou piscina.
  const maior = Math.max(0, ...contextuais.map(x => x.termos.length));
  for (let i = 8; i < maior; i++) for (const categoria of contextuais) {
    if (i < categoria.termos.length) add(categoria.termos[i], categoria.nome, i < 12);
  }
  for (const category of core) for (const termo of category.termos.slice(8)) add(termo, category.nome);
  for (const category of categorias.filter(c => !core.includes(c) && !active.includes(c)).sort((a,b)=>a.prioridade-b.prioridade)) {
    for (const termo of category.termos) add(termo, category.nome);
  }
  const entries = included.map(({termo,categoria,critico}) => ({termo,categoria,critico}));
  return {
    termos: entries.map(x => x.termo), entries,
    metadados: {
      tokensEstimados: tokens, termosIncluidos: included, termosDescartados: discarded,
      quantidadeIncluidos: included.length, quantidadeDescartados: discarded.length,
      limiteConfigurado, orcamentoTokens: orcamento, limiteTermos: MAX_TERMOS,
      modelo: contexto.modelo === 'nova-2' ? 'nova-2' : 'nova-3'
    }
  };
}

function toDeepgramParams(lista, modelo = 'nova-3') {
  const entries = Array.isArray(lista) ? lista : (lista?.entries || lista?.termos || []);
  const params = new URLSearchParams();
  const key = modelo === 'nova-2' ? 'keywords' : 'keyterm';
  for (const item of entries) {
    const termo = limpar(typeof item === 'string' ? item : item?.termo);
    if (!termo) continue;
    const forte = typeof item === 'object' && item.critico === true;
    params.append(key, modelo === 'nova-2' ? `${termo}:${forte ? 2 : 1}` : termo);
  }
  return params;
}

module.exports = { buildKeyterms, toDeepgramParams, estimarTokens, normalizar, LIMITE_PROVEDOR, FRACAO_SEGURA };

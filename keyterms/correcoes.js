'use strict';

function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
const correcoesBase = [
  { de: /\bsindico\b/giu, para: 'síndico', condicional: false },
  { de: /\bquorum\b/giu, para: 'quórum', condicional: false },
  { de: /\bcombate de segurança\b/giu, para: 'câmeras de segurança', condicional: false },
  { de: /\binovadores\b/giu, para: 'elevadores', condicional: true },
  { de: /\bgravadores\b/giu, para: 'elevadores', condicional: true }
];
function corrigirParaAta(texto, contexto = {}) {
  let saida = String(texto || '');
  const observacoes = [];
  const contextoTexto = normalizar([
    ...(Array.isArray(contexto.pauta) ? contexto.pauta.map(x => `${x?.titulo || ''} ${x?.descricao || ''}`) : []),
    contexto.assunto || '', contexto.textoAnterior || '', contexto.textoPosterior || ''
  ].join(' '));
  const manutencao = /manutencao|elevador|predio|reparo|reforma|obra/.test(contextoTexto);
  for (const regra of correcoesBase) {
    if (regra.condicional && !manutencao) continue;
    saida = saida.replace(regra.de, original => {
      observacoes.push({ original, sugerido: regra.para,
        motivo: regra.condicional ? 'correcao_contextual_manutencao' : 'grafia_padronizada',
        transcript_id: contexto.transcriptId ?? null, requer_conferencia: true });
      return regra.para;
    });
  }
  return { texto: saida, observacoes };
}
module.exports = { corrigirParaAta, correcoesBase };

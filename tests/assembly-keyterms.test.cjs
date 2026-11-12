'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKeyterms, toDeepgramParams, normalizar } = require('../keyterms/buildKeyterms');
const { categorias } = require('../keyterms/condominio.base');
const { corrigirParaAta } = require('../keyterms/correcoes');
const { nomeEmpresa } = require('../keyterms/contexto');
const Module = require('node:module');
const originalLoad=Module._load;
Module._load=function(request,...args){if(request==='@supabase/supabase-js')return{createClient:()=>({})};return originalLoad.call(this,request,...args);};
const core=require('../netlify/functions/lib/assembly-deepgram');
Module._load=originalLoad;

const contexto = {
  nomeCondominio: 'Condomínio Jardim das Águas',
  moradores: [
    {nome:'Ana Cláudia Ribeiro'}, {nome:'Carlos Eduardo Souza'}, {nome:'Felipe Rezende'},
    {nome:'Maria Oliveira'}, {nome:'João Pedro Almeida'}, {nome:'Fernanda Vieira'},
    {nome:'Beatriz Nogueira'}, {nome:'Rafael Costa'}, {nome:'Marcelo Ribeiro'}, {nome:'Patrícia Mendes'}
  ],
  empresas: ['Elevadores São José Ltda.', 'Segurança Ação & Cia'],
  pauta: [{titulo:'Manutenção dos elevadores'}, {titulo:'Reforma da piscina'}, {titulo:'Câmeras de segurança'}],
  tipoAssembleia: 'AGE', modelo:'nova-3'
};

test('dicionário contém exatamente as nove categorias pedidas', () => {
  assert.deepEqual(categorias.map(x => x.nome), ['Assembleia','Cargos e órgãos','Finanças',
    'Legislação e regras','Manutenção e obras','Segurança','Áreas e serviços','Convivência','Tecnologia e sistema']);
  assert.equal(categorias.find(x=>x.nome==='Manutenção e obras').termos.includes("caixa d'água"),true);
});
test('orçamento real não ultrapassa 85% de 500 tokens e limita em 100 termos', () => {
  const r = buildKeyterms(contexto);
  assert.ok(r.metadados.tokensEstimados <= 425);
  assert.ok(r.termos.length <= 100);
  assert.equal(r.metadados.quantidadeIncluidos, r.termos.length);
  assert.ok(r.metadados.quantidadeDescartados > 0);
});
test('limite da variável de ambiente é respeitado e nunca supera o limite do Deepgram', () => {
  assert.ok(buildKeyterms(contexto,{tokenLimit:100}).metadados.tokensEstimados <=85);
  assert.equal(buildKeyterms(contexto,{tokenLimit:2000}).metadados.limiteConfigurado,500);
});
test('não duplica termos mesmo com maiúsculas e acentos', () => {
  const r=buildKeyterms({...contexto, empresas:['Síndico','sindico','SÍNDICO', 'Câmeras de Segurança']});
  const normalized = r.termos.map(normalizar);
  assert.equal(new Set(normalized).size,normalized.length);
});
test('condomínio, nomes completos, primeiros nomes e empresas são priorizados', () => {
  const r=buildKeyterms(contexto);
  assert.equal(r.termos[0], 'Condomínio Jardim das Águas');
  assert.ok(r.termos.indexOf('Ana Cláudia Ribeiro') < r.termos.indexOf('quórum'));
  assert.ok(r.termos.includes('Ana'));
  assert.ok(r.termos.includes('Elevadores São José Ltda.'));
  assert.ok(r.termos.includes('Segurança Ação & Cia'));
});
test('pauta elevador e segurança promove categorias correspondentes', () => {
  const r=buildKeyterms(contexto);
  assert.ok(r.termos.includes('elevadores'));
  assert.ok(r.termos.includes('câmeras de segurança'));
  assert.ok(r.termos.includes('piscina'));
  assert.ok(r.entries.find(x => x.categoria === 'Manutenção e obras'));
});
test('Nova-3 usa keyterm repetido, Nova-2 usa keywords com peso, nunca misturados', () => {
  const data=buildKeyterms(contexto);
  const three=toDeepgramParams(data,'nova-3');
  assert.deepEqual(three.getAll('keyterm'),data.termos);
  assert.equal(three.has('keywords'),false);
  const two=toDeepgramParams(data,'nova-2');
  assert.ok(two.getAll('keywords').some(x=>x==='Condomínio Jardim das Águas:2'));
  assert.equal(two.has('keyterm'),false);
  assert.ok(two.getAll('keywords').some(x=>x.endsWith(':1')));
});
test('URL codifica espaços, acentos, apóstrofo e pontuação com parâmetro individual', () => {
  const params=toDeepgramParams(['síndico',"caixa d'água",'Empresa A, B']);
  const url=`https://api.deepgram.com/v1/listen?${params}`;
  assert.equal(new URL(url).searchParams.getAll('keyterm').length,3);
  assert.match(url, /s%C3%ADndico/);
  assert.match(url, /caixa\+d%27%C3%A1gua/);
  assert.match(url, /Empresa\+A%2C\+B/);
});
test('pós-correção só acontece na cópia e registra sugestões', () => {
  const bruta='Os inovadores precisam de conserto. O sindico pediu quorum.';
  const r=corrigirParaAta(bruta,{pauta:[{titulo:'Manutenção dos elevadores'}], transcriptId:15});
  assert.equal(bruta,'Os inovadores precisam de conserto. O sindico pediu quorum.');
  assert.match(r.texto,/elevadores/);
  assert.match(r.texto,/síndico/);
  assert.match(r.texto,/quórum/);
  assert.equal(r.observacoes.length,3);
  assert.ok(r.observacoes.every(x => x.transcript_id===15 && x.requer_conferencia));
  assert.equal(corrigirParaAta('Os inovadores chegaram.').texto,'Os inovadores chegaram.');
});
test('só cai para Nova-2 quando API retorna incompatibilidade de keyterms',()=>{
  assert.equal(core.keytermUnsupported(400,'Selected Nova-3 model does not support keyterm prompting'),true);
  assert.equal(core.keytermUnsupported(403,'Keyterm not available for selected model language'),true);
  assert.equal(core.keytermUnsupported(429,'Rate limit exceeded'),false);
  assert.equal(core.keytermUnsupported(400,'Keyterm limit exceeded. Maximum 500 tokens'),false);
});
test('identifica empresas citadas nas pautas/orçamentos sem inserir palavras genéricas',()=>{
  const r=nomeEmpresa('Cotação da empresa Elevadores São José Ltda. e da empresa Alfa Segurança Ltda.');
  assert.ok(r.some(x=>x.includes('Elevadores São José')));
  assert.ok(r.some(x=>x.includes('Alfa Segurança')));
});
test('geração por pauta registra dados reais, sem tags de peso em Nova-3', () => {
  const r=buildKeyterms(contexto);
  assert.ok(toDeepgramParams(r,'nova-3').getAll('keyterm').every(x => !/:\d$/.test(x)));
  assert.ok(r.metadados.termosDescartados.every(x=>x.motivo));
});

test('valores somente entram como keyterms quando estão cadastrados na pauta', () => {
  const withBudget=buildKeyterms({...contexto,pauta:[{titulo:'Elevadores',descricao:'Proposta de R$ 8.500,00 para os reparos'}]});
  assert.ok(withBudget.termos.includes('R$ 8.500,00'));
  assert.ok(!buildKeyterms({...contexto,pauta:[]}).termos.includes('R$ 8.500,00'));
});

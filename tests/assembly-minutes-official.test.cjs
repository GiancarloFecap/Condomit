'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const speech = require('../scripts/assembly/minutes-narrative');

const rows = [
  {id: 1,recording_id: 70,spoken_at:'2026-11-05T09:48:37Z',start_seconds:0,end_seconds:4,
    transcript:'Alguns moradores relatam problemas frequentes no elevador social.',
    participant_name:'Maria Oliveira', participant_email:'maria@exemplo.com', participant_identity:'__deepgram_speaker__:0'},
  {id: 2,recording_id: 70,spoken_at:'2026-11-05T09:48:42Z',start_seconds:5,end_seconds:10,
    transcript:'Foi apresentada uma proposta de manutenção no valor de 8500 reais.',
    participant_name:'Maria Oliveira', participant_email:'maria@exemplo.com', participant_identity:'__deepgram_speaker__:0'},
  {id: 3,recording_id: 70,spoken_at:'2026-11-05T09:48:55Z',start_seconds:12,end_seconds:16,
    transcript:'Eu acho que podemos adiar a obra devido aos custos.',
    participant_name:'Paulo Santos',participant_email:'paulo@exemplo.com',participant_identity:'__deepgram_speaker__:1'}
];

test('não omite manifestações, não mistura falantes e preserva proposta/orçamento', () => {
  const result = speech.fallbackParagraphs(rows);
  assert.equal(result.length, 2);
  assert.match(result[0], /^O participante Maria Oliveira /);
  assert.match(result[0], /elevador social/);
  assert.match(result[0], /R\$ 8\.500,00/);
  assert.match(result[1], /^O participante Paulo Santos /);
  assert.match(result[1], /adiamento da obra|adiamento de a obra|adiar a obra/i);
  assert.doesNotMatch(result.join(' '), /Às \d\d:\d\d|Falante \d+ declarou/);
});

test('uma minuta com transcrição não vira oficialmente completa sem falas', () => {
  assert.equal(speech.hasNarrative('A assembleia aconteceu. Votações: aprovadas.'), false);
  assert.equal(speech.hasNarrative('MANIFESTAÇÕES DOS PARTICIPANTES\n\nA síntese narrativa das manifestações está pendente de processamento.\n\nDELIBERAÇÕES E VOTAÇÕES'), false);
  const text = `Abertura.\n\n${speech.HEADING}\n\n${speech.fallbackParagraphs(rows).join('\n\n')}\n\n${speech.NEXT_HEADING}\n\nEncerramento.`;
  assert.equal(speech.hasNarrative(text), true);
});

test('painel mostra falas provisórias mesmo sem IA; versão assinada exige reabertura para alterar', () => {
  const content = fs.readFileSync(require.resolve('../scripts/assembly/assembly-summary.js'),'utf8');
  assert.match(content, /CondomitMinutesNarrative\?\.fallbackParagraphs/);
  assert.match(content, /minutesReopen0763/);
  assert.match(content, /reopenMinutesForReview/);
  assert.match(content, /state\.minutesDraft\?\.status === 'aprovada'\) return/);
});

test('editor e documento oficial usam a mesma minuta e a navegação inclui o módulo', () => {
  const content = fs.readFileSync(require.resolve('../scripts/assembly/assembly-summary.js'),'utf8');
  assert.match(content, /const rawDisplayText = state\.indirectTopics/);
  assert.match(content, /assemblyMinutesEditor074/);
  const page = fs.readFileSync(require.resolve('../pages/assembleia-resumo.html'),'utf8');
  assert.ok(page.indexOf('minutes-speech.js') < page.indexOf('minutes-narrative.js'));
  assert.ok(page.indexOf('minutes-narrative.js') < page.indexOf('assembly-summary.js'));
});

test('API usa regras locais somente quando explicitamente solicitado', async () => {
  const saved = { GEMINI_API_KEY:process.env.GEMINI_API_KEY, OPENAI_API_KEY:process.env.OPENAI_API_KEY,
    SUPABASE_URL:process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.GEMINI_API_KEY='';process.env.OPENAI_API_KEY='';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='fake-local-test-key';
  const makeQuery = (table) => {
    const q={};
    for(const method of ['select','eq','in','order','range','limit','ilike']) q[method]=()=>q;
    q.upsert=()=>Promise.resolve({data:null,error:null});
    q.maybeSingle=()=>Promise.resolve({data:table==='scheduled_assemblies'?{id:80,cep:'12345678',status:'encerrada'}:{email:'sindico@exemplo.com',user_type:'sindico',condominium:{cep:'12345678'}}});
    q.then=(onOk,onErr)=>Promise.resolve({data:({user_condominiums:[{condominium_id:'12345678'}],assembly_recordings:[{id:70}],assembly_transcripts:rows,assembly_agenda_items:[{title:'Elevadores'}]})[table]||[],error:null}).then(onOk,onErr);
    return q;
  };
  const supabase={rpc:async()=>({data:0,error:null}),auth:{getUser:async()=>({data:{user:{email:'sindico@exemplo.com'}}})},from:table=>makeQuery(table)};
  const original=Module._load;
  Module._load=function(name,...args){if(name==='@supabase/supabase-js')return{createClient:()=>supabase};return original.call(this,name,...args);};
  const filename=require.resolve('../netlify/functions/assembly-minutes-indirect.js');
  delete require.cache[filename];
  let handler;
  try {({handler}=require(filename));} finally {Module._load=original;}
  try {
    const result=await handler({httpMethod:'POST',headers:{authorization:'Bearer local-token'},body:JSON.stringify({assembly_id:80,provider:'rules'})});
    assert.equal(result.statusCode,200,result.body);
    const response=JSON.parse(result.body);
    assert.equal(response.method,'regras_locais_discurso_indireto');
    assert.equal(response.source_count,rows.length);
    assert.equal(response.paragraphs.length,2);
  } finally {
    for (const [key,value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});

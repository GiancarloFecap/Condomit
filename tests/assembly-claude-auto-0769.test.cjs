'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module = require('node:module');
const orig=Module._load;
Module._load=function(name,...rest){
  if(name==='@supabase/supabase-js')return {createClient:()=>({})};
  return orig.call(this,name,...rest);
};
const {summarizeClaude,validateAuthorship,promptFor} = require('../netlify/functions/assembly-minutes-indirect');
Module._load=orig;
const {requestClaudeMinutes,batchTopics} = require('../netlify/functions/lib/assembly-claude-minutes');
function topic(id, author, count=1){return {id,title:'Reforma da piscina',contributions:Array.from({length:count},(_,i)=>({name:author,role:'morador',text:`O participante relatou problemas da piscina e pediu avaliação da obra. Pedido número ${i+1}.`,source_ids:[String(i+1)]})),polls:[]};}
test('Claude usa chave no backend, formato /v1/messages e prompt institucional', async()=>{
  let request;
  const fetcher=async (url,opts)=>{
    request={url,opts};
    return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({assuntos:[{id:'agenda-1',paragrafos:['O morador João ressaltou a necessidade de manutenção da piscina e solicitou estudo técnico.']}]})}]})};
  };
  const result=await requestClaudeMinutes('ATA de teste',{apiKey:'key-secret-test',model:'claude-sonnet-5-5',fetcher});
  assert.equal(request.url,'https://api.anthropic.com/v1/messages');
  assert.equal(request.opts.headers['x-api-key'],'key-secret-test');
  assert.match(JSON.parse(request.opts.body).system,/não invente fatos/);
  assert.equal(result.assuntos[0].id,'agenda-1');
});
test('Claude rejeita truncamento de saída (não publica ATA incompleta)',async()=>{
 await assert.rejects(requestClaudeMinutes('ATA',{apiKey:'k',fetcher:async()=>({ok:true,json:async()=>({stop_reason:'max_tokens',content:[{type:'text',text:'{}'}]})})}),/limite de tokens/);
});
test('Claude não é chamado sem segredo no servidor',async()=>{
 await assert.rejects(requestClaudeMinutes('ATA',{apiKey:'',fetcher:async()=>{throw Error('não deve chamar rede');}}),/ANTHROPIC_API_KEY/);
});
test('segmentação de falas por blocos mantém todos os trechos na ordem original',()=>{
 const original=[topic('a','Maria',10),topic('b','João',8)];
 const batches=batchTopics(original,700);
 assert.ok(batches.length>1);
 const flattened=batches.flat().flatMap(t=>t.contributions.map(c=>c.source_ids[0]));
 const expected=original.flatMap(t=>t.contributions.map(c=>c.source_ids[0]));
 assert.deepEqual(flattened,expected);
 assert.ok(batches.every(batch => JSON.stringify(batch).length <= 800), 'nenhum bloco deve estourar a margem de caracteres');
});
test('autor identificado omitido bloqueia resultado do Claude',()=>{
 assert.throws(()=>validateAuthorship([{id:'a',paragraphs:['A obra foi discutida.']}],[topic('a','Maria')]),/omitiu/);
 assert.doesNotThrow(()=>validateAuthorship([{id:'a',paragraphs:['A moradora Maria apresentou sua avaliação sobre a obra da piscina.']}],[topic('a','Maria')]));
});
test('prompt indica autoria nominal e discurso indireto, sem transcrição literal',()=>{
 const p=promptFor([],[],[],[topic('a','Rubens')]);
 assert.match(p,/DISCURSO INDIRETO/);
 assert.match(p,/O morador Rubens/);
 assert.match(p,/Não copie frases literalmente/);
});
test('servidor reutiliza evidências e reidentifica antes de gerar a ata',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../netlify/functions/assembly-minutes-indirect.js'),'utf8');
 const callback=fs.readFileSync(path.join(__dirname,'../netlify/functions/assembly-deepgram-callback.js'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../scripts/assembly/room/transcription.js'),'utf8');
 assert.match(server,/condomit_auto_identify_deepgram_075/);
 assert.match(callback,/condomit_auto_identify_deepgram_075/);
 assert.match(client,/setInterval/);
 assert.match(client,/7000/);
});
test('somente a chave no servidor; frontend não armazena credenciais Claude',()=>{
 const front=fs.readFileSync(path.join(__dirname,'../scripts/assembly/assembly-summary.js'),'utf8');
 assert.doesNotMatch(front,/ANTHROPIC_API_KEY/);
 assert.doesNotMatch(front,/id="minutesClaude0769"/);
 assert.match(front,/startAutoMinutesRefresh/);
 assert.match(front,/local_only:useLocalAI/);
});

'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {measure} = require('../scripts/assembly/transcription-progress');
const {replaceAttributedName} = require('../scripts/assembly/speaker-draft');
const local = require('../scripts/assembly/local-ai-minutes');
const fs = require('node:fs');
const path = require('node:path');

test('progresso de vídeo em transcrição assíncrona não é inventado',()=>{
 const info=measure({status:'concluido',duration_seconds:180,transcription_status:'enfileirado',transcription_cursor_seconds:0});
 assert.equal(info.percent,null);
 assert.equal(info.total,180);
 assert.equal(info.current,0);
 assert.equal(info.complete,false);
});
test('progresso parcial só ocorre com cursor real',()=>{
 const info=measure({duration_seconds:180,transcription_status:'processando',transcription_cursor_seconds:90});
 assert.equal(info.percent,50);
 assert.equal(info.current,90);
});
test('progresso concluído de vídeo corresponde a 100%',()=>{
 const info=measure({duration_seconds:190,transcription_status:'concluido',transcription_cursor_seconds:190});
 assert.equal(info.percent,100);
 assert.equal(info.current,190);
});
test('falha não deve ser apresentada como concluída',()=>{
 const info=measure({duration_seconds:190,transcription_status:'falhou'});
 assert.equal(info.percent,null);
 assert.equal(info.failed,true);
});
test('nome identificado altera o parágrafo da minuta, mas não o texto bruto',()=>{
 const raw='Eu queria falar da reforma da piscina.';
 const body='O morador José ressaltou a necessidade de reformar a piscina. O morador Paulo apoiou a proposta.';
 const result=replaceAttributedName(body,{oldName:'José',newName:'Maria',newRole:'moradora'});
 assert.equal(result.body,'A moradora Maria ressaltou a necessidade de reformar a piscina. O morador Paulo apoiou a proposta.');
 assert.equal(result.changes,1);
 assert.equal(raw,'Eu queria falar da reforma da piscina.');
});
test('não atribui manifestação anônima a alguém quando há mais de uma voz anônima',()=>{
 const body='O participante ainda não identificado abordou a garagem.';
 const result=replaceAttributedName(body,{oldName:'',newName:'Ana',uniqueUnknownVoice:false});
 assert.equal(result.changes,0);
 assert.equal(result.requiresRegeneration,true);
});
test('única voz anônima pode ser identificada na minuta sem mexer nos dados brutos',()=>{
 const body='O participante ainda não identificado destacou a segurança.';
 const result=replaceAttributedName(body,{oldName:'',newName:'Ana',newRole:'moradora',uniqueUnknownVoice:true});
 assert.equal(result.body,'A moradora Ana destacou a segurança.');
});
test('agrupa contribuições da mesma pessoa no mesmo assunto',()=>{
 const grouped=local.contributionsBySpeaker([
  {name:'Carlos',role:'sindico',participant_email:'carlos@example.com',text:'Os elevadores precisam de reparos.',source_ids:['1']},
  {name:'Carlos',role:'sindico',participant_email:'carlos@example.com',text:'O orçamento é de R$ 500.',source_ids:['2']},
  {name:'Ana',role:'moradora',participant_email:'ana@example.com',text:'Prefiro obter mais propostas.',source_ids:['3']}
 ]);
 assert.equal(grouped.length,2);
 assert.match(grouped[0].text,/orçamento/);
 assert.equal(grouped[0].author,'O síndico Carlos');
 assert.deepEqual(grouped[0].source_ids,['1','2']);
});
test('resumo local usa modelo no dispositivo, sem depender de chave API',async()=>{
 const calls=[];
 const mock={chat:{completions:{create:async request=>{
    calls.push(request);return {choices:[{message:{content:'ressaltou a necessidade de reparar os elevadores, explicando os problemas existentes e defendendo a análise dos custos de manutenção.'}}]};
 }}}};
 const res=await local.summarizeTopics([{id:'elevadores',title:'Elevadores',contributions:[{name:'Carlos',role:'sindico',text:'Os elevadores precisam de reparos por causa dos problemas e devem ser analisados os custos.',source_ids:['10']}]}],{engine:mock});
 assert.equal(res[0].paragraphs.length,1);
 assert.match(res[0].paragraphs[0],/^O síndico Carlos ressaltou/);
 assert.equal(calls.length,1);
 assert.match(calls[0].messages[1].content,/não acrescente nomes/);
});
test('não aceita número inventado na geração local',()=>{
 assert.throws(()=>local.validateContinuation('propôs um orçamento de R$ 9999,00 para a obra.','O morador José','O valor disponível é R$ 500,00.'),/números/);
});
test('parágrafos são gerados por assunto e preservam autoria específica',async()=>{
 const mock={chat:{completions:{create:async ()=>({choices:[{message:{content:'destacou a importância dos reparos, solicitando análise técnica antes de qualquer encaminhamento.'}}]})}}};
 const out=await local.summarizeTopics([
 {id:'agenda-1',title:'Reforma da piscina',contributions:[{name:'Rubens',role:'tio',text:'Precisamos discutir a reforma da piscina e avaliar as propostas recebidas.',source_ids:['1']}]},
 {id:'agenda-2',title:'Segurança',contributions:[{name:'Maria',role:'moradora',text:'Precisamos reforçar a segurança com mais câmeras de monitoramento.',source_ids:['2']}]}
 ],{engine:mock});
 assert.equal(out.length,2);
 assert.match(out[0].paragraphs[0],/^O tio Rubens/);
 assert.match(out[1].paragraphs[0],/^A moradora Maria/);
});
test('solicitação de fonte local não invoca API de IA externa',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../netlify/functions/assembly-minutes-indirect.js'),'utf8');
 assert.match(src,/if \(localOnly\) return send\(200/);
 assert.ok(src.indexOf('if (localOnly) return send(200') < src.indexOf('await summarizeClaude(topicItems'));
});

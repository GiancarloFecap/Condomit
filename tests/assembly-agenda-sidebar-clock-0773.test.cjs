'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='@supabase/supabase-js')return {createClient:()=>({})};return original.call(this,name,...args)};
const auto=require('../netlify/functions/lib/assembly-auto-minutes');
const indirect=require('../netlify/functions/assembly-minutes-indirect');
Module._load=original;
const clock=require('../scripts/assembly/assembly-meeting-time');
const root=path.resolve(__dirname,'..');

test('reunião real inicia 08:29 e encerra 08:34 (não usa horários planejados repetidos)',()=>{
 const meta=clock.meetingMeta({date:'2026-11-19',start_time:'08:29:00',end_time:'08:29:00',started_at:'2026-11-19T11:29:28.186Z',ended_at:'2026-11-19T11:34:09.540Z'});
 assert.deepEqual(meta,{date:'19/11/2026',start:'08:29',end:'08:34',range:'08:29 – 08:34'});
});

test('data da reunião vem do início real em São Paulo, inclusive na virada de dia',()=>{
 const meta=clock.meetingMeta({date:'2026-11-18',started_at:'2026-11-19T02:59:00Z',ended_at:'2026-11-19T03:11:00Z'});
 assert.equal(meta.date,'18/11/2026');
 assert.equal(meta.range,'23:59 – 00:11');
});

test('quando falta horário real de saída não inventa finalização pelo horário agendado',()=>{
 const meta=clock.meetingMeta({start_time:'08:29:00',end_time:'08:29:00',started_at:'2026-11-19T11:29:28Z'});
 assert.equal(meta.range,'08:29');
 assert.equal(meta.end,null);
});

test('abertura sem cargo e sem duplicar o presidente, incluindo os demais participantes',()=>{
 const result=auto.formalOpening({meeting:{date:'2026-11-19',start_time:'08:29',title:'Teste Modelo ATA',created_by:'admin@condomit.com'},attendees:[
   {user_email:'admin@condomit.com',participant_name:'Administrador Condomit',participant_role:'sindico'},
   {user_email:'admin@condomit.com',participant_name:'Administrador Condomit',participant_role:'sindico'},
   {user_email:'morador@condomit.com',participant_name:'Giancarlo Munarin',participant_role:'morador'}
 ]});
 assert.match(result,/sob a presidência de Administrador Condomit, com a presença do participante Giancarlo Munarin/);
 assert.equal((result.match(/Administrador Condomit/g)||[]).length,1);
 assert.doesNotMatch(result,/\(Morador\)|\(Síndico\)/);
});

test('pauta não cadastrada é identificada com base na transcrição e aparece na ATA',()=>{
 const topics=[{id:'outros-assuntos',title:'Outros assuntos discutidos',registered:false,contributions:[],polls:[]}];
 const narrative=[{id:'outros-assuntos',title:'Outros assuntos discutidos',inferred_title:'Instalação de câmeras na portaria',paragraphs:['O morador João sugeriu instalar câmeras na entrada do condomínio, explicando os riscos de segurança existentes.']}];
 const result=auto.composeDraft({meeting:{date:'2026-11-19',title:'Teste'},topics,narrative,attendees:[]});
 assert.match(result,/A pauta do dia compreendeu: Instalação de câmeras na portaria\./);
 assert.doesNotMatch(result,/Outros assuntos discutidos/);
 assert.match(result,/O morador João sugeriu/);
});

test('pauta cadastrada preserva o título oficial e não confunde com a pauta inferida',()=>{
 const topics=[{id:'agenda-3',title:'Prestação de contas 2026',registered:true,contributions:[],polls:[]}];
 const narrative=[{id:'agenda-3',inferred_title:'Assunto alterado',paragraphs:['O síndico João apresentou a prestação de contas referente ao exercício financeiro, conforme os documentos disponíveis.']}];
 assert.match(auto.agendaParagraph(topics,narrative),/previamente cadastrados: Prestação de contas 2026/);
 assert.doesNotMatch(auto.agendaParagraph(topics,narrative),/Assunto alterado/);
});

test('Claude recebe todas as falas originais e devolve título inferido para pauta não cadastrada',async()=>{
 const topics=[{id:'outros-assuntos',title:'Outros assuntos discutidos',registered:false,polls:[],contributions:[{name:'João',role:'morador',text:'Precisamos instalar câmeras na entrada. Já tivemos problemas de segurança.'}]}];
 const old=process.env.ANTHROPIC_API_KEY;
 process.env.ANTHROPIC_API_KEY='fake-test-key';
 try {
  const output=await indirect.summarizeClaude(topics,async(url,config)=>{
   const message=JSON.parse(config.body).messages[0].content;
   assert.match(message,/cadastrada":false/);
   assert.match(message,/Precisamos instalar câmeras na entrada/);
   return {ok:true,headers:{get:()=>null},json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({assuntos:[{id:'outros-assuntos',pauta_inferida:'Segurança na portaria',paragrafos:['O morador João propôs a instalação de câmeras para reforçar a segurança na entrada do condomínio.']} ]})}]})};
  });
  assert.equal(output[0].inferred_title,'Segurança na portaria');
 } finally {if(old===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=old;}
});

test('sidebar procura nome atual no Supabase e edição dispara sincronização imediata',()=>{
 const sidebar=fs.readFileSync(path.join(root,'scripts/sidebar-links.js'),'utf8');
 const settings=fs.readFileSync(path.join(root,'scripts/configuracoes.js'),'utf8');
 assert.match(sidebar,/refreshSidebarCondominiumName/);
 assert.match(sidebar,/\?select=cep,condominium_name/);
 assert.match(sidebar,/getSidebarCondominiumCep\(getSidebarCurrentUser\(\)\)!==cep/);
 assert.match(settings,/condomit:condominium-updated/);
 assert.match(sidebar,/window\.setSidebarCondominiumName=setSidebarCondominiumName/);
});

test('o card mostra o horário real e não repete end_time da programação',()=>{
 const ui=fs.readFileSync(path.join(root,'scripts/assembly/assembly-summary.js'),'utf8');
 assert.match(ui,/CondomitAssemblyMeetingTime\?\.meetingMeta\(a\)/);
 assert.match(ui,/\$\{esc\(meetingMeta\.range\)\}/);
 const page=fs.readFileSync(path.join(root,'pages/assembleia-resumo.html'),'utf8');
 assert.match(page,/assembly-meeting-time\.js\?v=0773/);
});

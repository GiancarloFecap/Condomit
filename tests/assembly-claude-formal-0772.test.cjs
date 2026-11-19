'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const orig=Module._load;
Module._load=function(name,...args){if(name==='@supabase/supabase-js')return {createClient:()=>({})};return orig.call(this,name,...args);};
const pipeline=require('../netlify/functions/lib/assembly-auto-minutes');
const {summarizeClaude}=require('../netlify/functions/assembly-minutes-indirect');
Module._load=orig;
const root=path.resolve(__dirname,'..');

test('abertura da ATA usa data por extenso, hora, condomínio, endereço e presença reais',()=>{
 const opening=pipeline.formalOpening({meeting:{date:'2026-11-12',start_time:'11:59:00',title:'Teste 2',assembly_type:'ordinaria',cep:'99999999',created_by:'admin@exemplo.com'},
 condominium:{condominium_name:'Condomit',address:'Ambiente administrativo',address_number:'100',neighborhood:'Administração',city:'São Paulo',state:'SP',cep:'99999-999'},
 attendees:[{user_email:'giancarlo@exemplo.com',participant_name:'Giancarlo Munarin',participant_role:'morador'},
 {user_email:'admin@exemplo.com',participant_name:'Administrador Condomit',participant_role:'admin'}]});
 assert.match(opening,/Ao décimo segundo dia do mês de novembro de 2026, às 11h59/);
 assert.match(opening,/nas dependências do Condomit, situado em Ambiente administrativo, 100 – Administração – São Paulo\/SP – CEP 99999-999/);
 assert.match(opening,/Assembleia Geral Ordinária intitulada “Teste 2”/);
 assert.match(opening,/sob a presidência de Administrador Condomit/);
 assert.match(opening,/sob a presidência de Administrador Condomit, com a presença do participante Giancarlo Munarin/);
 assert.doesNotMatch(opening,/\(Morador\)|\(Síndico\)|participantes Administrador Condomit/);
 assert.match(opening,/registro eletrônico de frequência mantido pelo Condomit/);
});

test('abertura não inventa local, horário ou presidência quando ausentes',()=>{
 const opening=pipeline.formalOpening({meeting:{date:'2026-11-12',title:'Pauta',assembly_type:'extraordinaria'},attendees:[]});
 assert.match(opening,/Assembleia Geral Extraordinária/);
 assert.doesNotMatch(opening,/às.*h\d+/);
 assert.doesNotMatch(opening,/situado em|sob a presidência de/);
});

test('síndico vê só o indicador antes do Claude e transcrição pronta não ocupa espaço',()=>{
 const script=fs.readFileSync(path.join(root,'scripts/assembly/assembly-summary.js'),'utf8');
 const start=script.indexOf('function renderMinutes()');
 const slice=script.slice(start,start+7000);
 assert.match(slice,/const ready=approved \|\| \(job\?\.status==='concluido'/);
 assert.match(slice,/if\(!ready\) \{\s*state\.renderedMinutesBody='';\s*container\.innerHTML=autoMinutesProgressMarkup\(\)/);
 assert.match(slice,/return;\s*}\s*const manuallyEdited=/);
 assert.doesNotMatch(slice,/state\.generatedMinutes = paragraphs\.join/);
 assert.match(script,/row\.transcription_status !== 'concluido'/);
 assert.doesNotMatch(script,/id="minutesRegenerate07510"/);
 assert.doesNotMatch(script,/id="minutesLocalAi0768"/);
});

test('percentual de Claude é por blocos recebidos, não uma estimativa fictícia de tempo',async()=>{
 const input=[{id:'tema',title:'Conservação do prédio',registered:true,polls:[],contributions:[{name:'Maria',role:'moradora',text:'Precisamos avaliar a manutenção do elevador. O custo deve ser aprovado depois da cotação.'}]}];
 const reports=[];
 const fetcher=async(url,config)=>{
  const body=JSON.parse(config.body);
  assert.match(body.messages[0].content,/Maria/);
  return {ok:true,headers:{get:()=>null},json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({assuntos:[{id:'tema',paragrafos:['A moradora Maria apresentou uma avaliação sobre o estado do elevador, defendendo a obtenção de cotações antes de eventual aprovação de despesas.']} ]})}]})};
 };
 const old=process.env.ANTHROPIC_API_KEY;
 process.env.ANTHROPIC_API_KEY='test-only-not-a-real-key';
 let out;
 try {out=await summarizeClaude(input,fetcher,async report=>reports.push(report));}
 finally {if(old===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=old;}
 assert.equal(out[0].paragraphs.length,1);
 assert.deepEqual(reports,[{completed:0,total:1},{completed:1,total:1}]);
});

test('migração restringe reidentificação ao serviço e preserva correção manual',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/074_assembly_claude_formal_opening_speaker_progress.sql'),'utf8');
 assert.match(sql,/auth\.role\(\).*service_role/);
 assert.match(sql,/assignment_source<>'reviewed'/);
 assert.match(sql,/matched_seconds>=r\.total_seconds\*0\.55/);
 assert.match(sql,/second_seconds\*1\.45/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS progress_total/);
});

test('mudança manual dispara processamento no servidor, sem sobrescrever ATA aprovada',()=>{
 const front=fs.readFileSync(path.join(root,'scripts/assembly/assembly-summary.js'),'utf8');
 const server=fs.readFileSync(path.join(root,'netlify/functions/assembly-minutes-speaker-refresh.js'),'utf8');
 assert.match(front,/assembly-minutes-speaker-refresh/);
 assert.match(server,/assembly_minutes_signatures/);
 assert.match(server,/assembly_deepgram_speakers/);
 assert.match(server,/status:'pendente',attempts:0/);
 assert.match(server,/ANTHROPIC_API_KEY|adminClient/);
});

test('não é possível reagendar a geração se não houver mudança de voz recente',async()=>{
 const {refreshSpeakerMinutes}=require('../netlify/functions/assembly-minutes-speaker-refresh');
 const called=[];
 function query(table){
  const q={select(){return q;},eq(){return q;},ilike(){return q;},gte(){return q;},limit(){return Promise.resolve({data:[],error:null});},
   maybeSingle:async()=>({data:table==='users'?{user_type:'sindico',condominium:{cep:'99999999'}}:
      table==='scheduled_assemblies'?{id:12,cep:'99999999',status:'encerrada'}:
      table==='assembly_recordings'?{id:5,assembly_id:12}:null,error:null}),
   then:(resolve,reject)=>Promise.resolve({data:table==='user_condominiums'?[{condominium_id:'99999999'}]:[],error:null}).then(resolve,reject),
   upsert:async payload=>{called.push(payload);return {error:null}}
  };return q;
 }
 const result=await refreshSpeakerMinutes({from:query},{assemblyId:12,recordingId:5,email:'sindico@exemplo.com'});
 assert.equal(result.statusCode,409);
 assert.equal(called.length,0);
});

test('autorização do síndico não concede acesso a assembleias de outro condomínio',async()=>{
 const {refreshSpeakerMinutes}=require('../netlify/functions/assembly-minutes-speaker-refresh');
 const admin={from:table=>({select(){return this},ilike(){return this},eq(){return this},
   maybeSingle:async()=>({data:table==='users'?{user_type:'sindico',condominium:{cep:'11111111'}}:
    table==='scheduled_assemblies'?{id:15,cep:'99999999',status:'encerrada'}:
    table==='assembly_recordings'?{assembly_id:15}:null,error:null}),
   then:(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject)})};
 const result=await refreshSpeakerMinutes(admin,{assemblyId:15,recordingId:3,email:'admin@exemplo.com'});
 assert.equal(result.statusCode,403);
});


test('horário efetivo de início prevalece sobre horário planejado, com fuso de São Paulo',()=>{
 const opening=pipeline.formalOpening({meeting:{date:'2026-11-12',start_time:'08:00:00',
   started_at:'2026-11-12T15:59:00Z',title:'Prestação de contas'}});
 assert.match(opening,/Ao décimo segundo dia do mês de novembro de 2026, às 12h59/);
 assert.doesNotMatch(opening,/08h00/);
});

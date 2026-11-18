'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(name,...args){
  if(name==='@supabase/supabase-js') return {createClient:()=>({})};
  return originalLoad.call(this,name,...args);
};
const pipeline=require('../netlify/functions/lib/assembly-auto-minutes');
const {promptFor}=require('../netlify/functions/assembly-minutes-indirect');
const {readyAssemblies}=require('../netlify/functions/assembly-minutes-auto-dispatch');
Module._load=originalLoad;
const row=(id,text,name,role='morador',index=0)=>({
  id,recording_id:1,participant_email:`${name.toLowerCase()}@teste.com`,participant_name:name,
  participant_role:role,participant_identity:`__deepgram_speaker__:${index}`,
  spoken_at:new Date(Date.UTC(2026,10,18,15,0,id)).toISOString(),start_seconds:id*2,end_seconds:id*2+1,transcript:text
});

test('Claude recebe a transcrição Deepgram integral, com nomes e cargos, não a minuta anterior',()=>{
  const rows=[row(1,'Ééé, preciso falar sobre elevadores e orçamento de R$ 8.500,00.','Maria','moradora'),
    row(2,'Temos que votar a manutenção, depois discutimos mais.','Carlos','sindico',1)];
  const items=pipeline.buildRawClaudeTopics(rows,[],[{id:7,title:'Manutenção dos elevadores'}]);
  pipeline.verifyRawCoverage(rows,items);
  const all=items.flatMap(t=>t.contributions);
  assert.ok(all.find(x=>x.name==='Maria' && x.role==='moradora' && x.text===rows[0].transcript));
  assert.ok(all.find(x=>x.name==='Carlos' && x.role==='sindico' && x.text===rows[1].transcript));
  const prompt=promptFor([],[],[],items);
  assert.match(prompt,/Ééé, preciso falar sobre elevadores/);
  assert.match(prompt,/A moradora Maria/);
  assert.match(prompt,/O síndico Carlos/);
  assert.doesNotMatch(prompt,/resumo provisório por regras/i);
});

test('fala extensa é transmitida integralmente por partes, sem resumir ou truncar',()=>{
  const full='palavras importantes com valores 1234,56. '.repeat(920);
  const rows=[row(1,full,'João')];
  const topics=pipeline.buildRawClaudeTopics(rows,[],[]);
  assert.ok(topics.flatMap(t=>t.contributions).length>1);
  pipeline.verifyRawCoverage(rows,topics);
  const actual=topics.flatMap(t=>t.contributions).map(p=>p.text).join('');
  assert.equal(actual,full);
});

test('fala sem identificação continua sem nome inventado',()=>{
 const unknown={...row(4,'Solicito melhorias nas câmeras.','Maria'),participant_email:'falante@condomit.invalid',participant_name:'Falante 1'};
 const topics=pipeline.buildRawClaudeTopics([unknown]);
 const item=topics.flatMap(t=>t.contributions)[0];
 assert.equal(item.name,null);
 assert.match(item.voice,/Falante 1/);
});

test('montagem da minuta associa votação real ao tópico e exige revisão',()=>{
 const texts=pipeline.composeDraft({meeting:{date:'2026-11-18',title:'Reforma da piscina',assembly_type:'ordinaria'},
   topics:[{id:'p',title:'Piscina',contributions:[{name:'João'}],polls:[{id:7,title:'Reforma da piscina'}]}],
   narrative:[{id:'p',paragraphs:['O morador João discutiu os custos da reforma da piscina e solicitou avaliação de propostas.']}],
   options:[{id:1,poll_id:7,option_text:'Sim'},{id:2,poll_id:7,option_text:'Não'}],
   votes:[{poll_id:7,option_id:1},{poll_id:7,option_id:1},{poll_id:7,option_id:2}]});
 assert.ok(texts.indexOf('O morador João')<texts.indexOf('foram registrados 3 votos'));
 assert.match(texts,/Sim: 2 votos/);
 assert.match(texts,/Não: 1 voto/);
 assert.match(texts,/conferência, aprovação e assinatura do síndico/);
});

test('despacho automático só para todas as gravações finalizadas e transcritas',async()=>{
 const query=(result)=>({select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(){return Promise.resolve({data:result,error:null});},then(cb){return Promise.resolve({data:result,error:null}).then(cb);}});
 const admin={from(table){
   if(table==='scheduled_assemblies')return query([{id:4,status:'encerrada'},{id:5,status:'encerrada'},{id:6,status:'encerrada'}]);
   if(table==='assembly_recordings')return query([
      {assembly_id:4,id:1,status:'concluido',transcription_status:'concluido',transcription_model:'deepgram:nova-3'},
      {assembly_id:5,id:2,status:'concluido',transcription_status:'processando',transcription_model:'deepgram:nova-3'},
      {assembly_id:6,id:3,status:'falhou',transcription_status:'pendente',transcription_model:'deepgram:nova-3'}]);
   return query([]);
 }};
 const result=await readyAssemblies(admin);
 assert.deepEqual(result.map(x=>x.id),[4]);
});

test('a geração é executada no servidor, sem botão de Claude na interface',()=>{
 const root=path.join(__dirname,'..');
 const client=fs.readFileSync(path.join(root,'scripts/assembly/assembly-summary.js'),'utf8');
 const callback=fs.readFileSync(path.join(root,'netlify/functions/assembly-deepgram-callback.js'),'utf8');
 const worker=fs.readFileSync(path.join(root,'netlify/functions/assembly-minutes-auto-background.js'),'utf8');
 const conf=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
 assert.doesNotMatch(client,/id="minutesClaude0769"/);
 assert.match(client,/startAutoMinutesRefresh/);
 assert.match(callback,/assembly_auto_minutes_jobs/);
 assert.match(worker,/existing\?\.status==='aprovada'/);
 assert.match(worker,/ignoreDuplicates:true/);
 assert.match(conf,/\[functions\."assembly-minutes-auto-dispatch"\]/);
});

test('migração inclui proteção RLS e proíbe substituição de ATA publicada',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/073_assembly_claude_automatic_from_deepgram.sql'),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/TO authenticated/);
 assert.match(sql,/condomit_user_belongs_to_cep/);
 assert.match(sql,/service_role/);
});

test('tarefa automática salva minuta nova, mas nunca sobrescreve revisão já existente',async()=>{
 const {runAuto}=require('../netlify/functions/assembly-minutes-auto-background');
 function mock(initialDraft=null) {
   const state={
     assembly_auto_minutes_jobs:{assembly_id:9,status:'pendente',attempts:0},
     assembly_minutes_drafts:initialDraft,
     assembly_minutes_signatures:null,
     scheduled_assemblies:{id:9,cep:'01234567',status:'encerrada'}
   };
   function current(table){return state[table];}
   function query(table,operation='select',payload={}){
     const filters=[];
     const self={
       select(){return self;},
       eq(key,value){filters.push([key,value]);return self;},
       update(value){return query(table,'update',value);},
       async upsert(value,opts){
         if(table==='assembly_minutes_drafts' && !state[assembly_idKey(table)]) state[table]={...value};
         return {error:null};
       },
       maybeSingle:async()=>{
         const row=current(table);
         if(!row || filters.some(([key,val])=>row[key]!==val)) return {data:null,error:null};
         if(operation==='update')Object.assign(row,payload);
         return {data:{...row},error:null};
       },
       then(resolve,reject){return Promise.resolve().then(()=>{
         const row=current(table);
         if(row && !filters.some(([key,val])=>row[key]!==val) && operation==='update')Object.assign(row,payload);
         return {error:null};
       }).then(resolve,reject);}
     };
     return self;
   }
   const assembly_idKey=table=>table;
   return {state,admin:{from(table){return query(table);}}};
 }
 const text='O morador João apresentou uma análise das condições de manutenção da piscina, indicando providências necessárias e custos estimados para deliberação.';
 const first=mock();
 const result=await runAuto(first.admin,9,async()=>({body:text,source_hash:'abc',source_count:4,unidentified_speakers:0}));
 assert.equal(result.generated,true);
 assert.equal(result.saved,true);
 assert.equal(first.state.assembly_minutes_drafts.body,text);
 assert.equal(first.state.assembly_auto_minutes_jobs.status,'concluido');
 const previous={assembly_id:9,status:'rascunho',body:'Ata revisada manualmente pelo síndico antes da geração.',saved_by:'sindico@exemplo.com'};
 const second=mock({...previous});
 const res2=await runAuto(second.admin,9,async()=>({body:text,source_hash:'abc',source_count:4,unidentified_speakers:0}));
 assert.equal(res2.saved,false);
 assert.equal(second.state.assembly_minutes_drafts.body,previous.body);
 assert.equal(second.state.assembly_auto_minutes_jobs.generated_body,text);
});

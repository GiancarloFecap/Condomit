'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const {amount,factList,missingFacts}=require('../scripts/assembly/minutes-integrity');
const beforeModule=Module._load;
Module._load=function(name,...args){if(name==='@supabase/supabase-js')return{createClient:()=>({})};return beforeModule.call(this,name,...args);};
const {summarizeClaude}=require('../netlify/functions/assembly-minutes-indirect');
Module._load=beforeModule;
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('normalização brasileira preserva custos equivalentes (R$ 25.000,00 / 25 mil reais)',()=>{
 assert.equal(amount('25.000,00'),25000);
 assert.equal(amount('25 mil'),25000);
 assert.equal(amount('1,5 milhão'),1500000);
 assert.deepEqual(missingFacts('O orçamento é de R$ 25.000,00. A despesa será reduzida em 20%.',
  'Foi apresentado um orçamento de 25 mil reais e uma redução de vinte por cento.' ).map(x=>x.found),['20%']);
 assert.deepEqual(missingFacts('O orçamento é de R$ 25.000,00.', 'O orçamento estimado é de 25 mil reais.'),[]);
});

test('detecta custo de operação e percentual omitidos na edição formal',()=>{
 const original=[{id:91,transcript:'Foi feito orçamento de R$ 17.850,50 para reparar o portão; 35% será custeado pelo condomínio.'}];
 const edited='O síndico falou sobre a manutenção do portão e solicitou a aprovação da operação.';
 assert.deepEqual(missingFacts(original,edited).map(x=>x.type),['money','percent']);
 const fixed='O síndico apresentou o orçamento de R$ 17.850,50 e explicou que 35% do custo caberá ao condomínio.';
 assert.equal(missingFacts(original,fixed).length,0);
});

test('transcrição sem números não força números fictícios',()=>{
 assert.equal(factList('A moradora destacou problemas na segurança da entrada.').length,0);
});

test('Claude não pode finalizar uma pauta ao omitir orçamento transcrito', async()=>{
 const topic={id:'portao',title:'Reforma do portão',registered:true,polls:[],contributions:[
  {name:'João',role:'síndico',text:'A proposta de reforma custa R$ 25.000,00 e é necessária porque o portão falhou repetidamente.'}
 ]};
 const previous=process.env.ANTHROPIC_API_KEY;
 process.env.ANTHROPIC_API_KEY='fake-test-key';
 try {
  const fake=async()=>({ok:true,headers:{get:()=>null},json:async()=>({stop_reason:'end_turn',content:[{
   type:'text',text:JSON.stringify({assuntos:[{id:'portao',paragrafos:['O síndico João apresentou uma proposta para reformar o portão, devido às falhas recorrentes observadas no condomínio.']} ]})
  }]})});
  await assert.rejects(summarizeClaude([topic],fake),/omitiu informações essenciais.*R\$ 25\.000,00/i);
 } finally {if(previous===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=previous;}
});

test('botões e indicadores seguem a revisão e ocultam progresso transcrito concluído',()=>{
 const js=source('scripts/assembly/assembly-summary.js');
 assert.doesNotMatch(js,/Gerar tarefas das decisões<\/button>/);
 assert.match(js,/id="minutesApproveHero0774"/);
 assert.match(js,/id="minutesReopenHero0774"/);
 assert.match(js,/id="minutesRegenerate0774"/);
 assert.match(js,/id="minutesIntegrity0774"/);
 assert.match(js,/currentUserRole\(\) === 'sindico' && !approved/);
 assert.match(js,/A ata está sendo feita, por favor aguarde/);
 assert.doesNotMatch(js,/fa-brain/);
 assert.doesNotMatch(js,/fa-clipboard-check/);
 assert.doesNotMatch(js,/Transcrição Deepgram concluída\. Revise as falas/);
 assert.match(js,/if \(row\.transcription_status === 'concluido'\) transcript\.replaceChildren\(\)/);
 assert.match(js,/updateMinutesIntegrityBanner\(body\)/);
 assert.doesNotMatch(source('netlify/functions/lib/assembly-auto-minutes.js'),/identificada a partir das manifestações transcritas pelo Deepgram/);
 assert.doesNotMatch(source('scripts/assembly/upload-progress.js'),/O LiveKit não informa a porcentagem/);
 assert.doesNotMatch(source('netlify/functions/lib/assembly-upload-progress.js'),/Preparando gravação no LiveKit/);
 const page=source('pages/assembleia-resumo.html');
 assert.match(page,/minutes-integrity\.js\?v=0774/);
 assert.ok(page.indexOf('minutes-integrity.js')<page.indexOf('assembly-summary.js'));
 const css=source('styles/assembleia-resumo.css');
 assert.match(css,/\.formal-signature-artwork/);
 assert.match(js,/class="formal-signature-artwork"/);
 assert.match(js,/formal-signature-electronic[\s\S]*?class="signature-line"/);
});

test('nova ATA exige migração 075 com permissão de síndico e sem sobrescrever assinatura',()=>{
 const endpoint=source('netlify/functions/assembly-minutes-regenerate.js');
 assert.match(endpoint,/assembly_minutes_signatures/);
 assert.match(endpoint,/user_condominiums/);
 assert.match(endpoint,/status==='aprovada'/);
 assert.match(endpoint,/manual_request_at/);
 assert.match(endpoint,/status:'pendente'/);
 const sql=source('supabase/migrations/075_assembly_speaker_fallback_and_regeneration.sql');
 assert.match(sql,/manual_request_at TIMESTAMPTZ/);
 assert.match(sql,/condomit_auto_identify_deepgram_075/);
 assert.match(sql,/assignment_source <> 'reviewed'/);
 assert.match(sql,/seconds_matched >= 2\.5/);
 assert.match(sql,/GRANT EXECUTE.*service_role/);
});

test('solicitação de nova ATA é bloqueada sem autorização ou durante processamento',async()=>{
 const original=Module._load;
 Module._load=function(name,...rest){if(name==='@supabase/supabase-js')return{createClient:()=>({})};return original.call(this,name,...rest);};
 let requestNewMinutes;
 try {({requestNewMinutes}=require('../netlify/functions/assembly-minutes-regenerate'));}
 finally {Module._load=original;}
 const tables={};
 const base={
  users:{user_type:'sindico',condominium:{cep:'99999999'}},
  scheduled_assemblies:{id:55,cep:'99999999',status:'encerrada'},
  assembly_minutes_drafts:{status:'rascunho'},
  assembly_minutes_signatures:null,
  assembly_auto_minutes_jobs:{status:'concluido',manual_request_at:null,locked_until:null}
 };
 const make=(model)=>({from(table){
  const q={select(){return q;},ilike(){return q;},eq(){return q;},
   maybeSingle:async()=>({data:model[table]??null,error:null}),
   upsert:async data=>{tables[table]=data;return {error:null};},
   then:(ok,fail)=>Promise.resolve({data:table==='user_condominiums'?[{condominium_id:'99999999'}]:table==='assembly_recordings'?
    [{id:99,status:'concluido',transcription_status:'concluido',transcription_model:'deepgram:nova-3'}]:[],error:null}).then(ok,fail)
  };return q;
 }});
 const now=new Date('2026-11-19T12:00:00Z');
 const good=await requestNewMinutes(make(base),{assemblyId:55,email:'sindico@exemplo.com',now});
 assert.equal(good.statusCode,200);
 assert.equal(tables.assembly_auto_minutes_jobs?.status,'pendente');
 assert.equal(tables.assembly_auto_minutes_jobs?.manual_request_at,now.toISOString());
 const busy=await requestNewMinutes(make({...base,assembly_auto_minutes_jobs:{status:'processando'}}),{assemblyId:55,email:'sindico@exemplo.com',now});
 assert.equal(busy.statusCode,409);
 const signed=await requestNewMinutes(make({...base,assembly_minutes_signatures:{assembly_id:55}}),{assemblyId:55,email:'sindico@exemplo.com',now});
 assert.equal(signed.statusCode,409);
 const stranger=await requestNewMinutes(make({...base,users:{user_type:'morador',condominium:{cep:'99999999'}}}),{assemblyId:55,email:'morador@exemplo.com',now});
 assert.equal(stranger.statusCode,403);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request,...args) {
  if (request === '@supabase/supabase-js') return { createClient:()=>({}) };
  return originalLoad.call(this,request,...args);
};
const core = require('../netlify/functions/lib/assembly-deepgram');
Module._load = originalLoad;

function mockAdmin(changes, fallback = false) {
  const mockData = {
    scheduled_assemblies: {id:21,cep:'12345678',title:'Assembleia',created_by:'sindico@teste.com',assembly_type:'extraordinaria'},
    assembly_agenda_items:[{title:'Manutenção dos elevadores e câmeras',description:'Proposta da empresa Elevadores Vale Ltda.'}],
    assembly_attendance:[{user_email:'sindico@teste.com',participant_name:'João Oliveira'},{user_email:'maria@teste.com',participant_name:'Maria Alves'}],
    assembly_documents:[{title:'Cotação',description:'Empresa Segurança Alfa Ltda.'}],
    users:[{email:'sindico@teste.com',name:'João Oliveira',user_type:'sindico',condominium:{name:'Condomínio Vista Alegre'}},
      {email:'maria@teste.com',name:'Maria Alves',user_type:'morador',condominium:{name:'Condomínio Vista Alegre'}}],
    user_condominiums:[{user_email:'sindico@teste.com'},{user_email:'maria@teste.com'}],
    assembly_deepgram_jobs:{fallback_to_nova2:fallback}
  };
  return {
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.supabase.co/storage/v1/object/sign/audio?token=abc'},error:null})})},
    from(table) {
      const q={};
      for (const prop of ['select','eq','order','limit','in']) q[prop] = () => q;
      q.maybeSingle=async()=>({data:mockData[table],error:null});
      q.then=(resolve,reject)=>Promise.resolve({data:mockData[table] || [],error:null}).then(resolve,reject);
      q.update=(value)=>{changes.push({table,value});return q;};
      return q;
    }
  };
}
const recording={id:9,assembly_id:21,recording_url:'storage://condomit-assembly-recordings/21/audio.mp4',status:'concluido'};
function envs() {
  const keys=['DEEPGRAM_API_KEY','SUPABASE_URL','URL','DEEPGRAM_MODEL'];
  const originals=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.DEEPGRAM_API_KEY='dummy-key';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.URL='https://condomit.com.br';
  delete process.env.DEEPGRAM_MODEL;
  return () => { for (const k of keys) originals[k] === undefined ? delete process.env[k] : process.env[k] = originals[k]; };
}

test('fluxo real agrega nomes e pauta à submissão, registra auditável e mantém parâmetros',async()=>{
  const restore=envs(); const changes=[];
  try {
    const requests=[];
    const fetcher=async (url,opts) => {requests.push({url,opts});return {ok:true,json:async()=>({request_id:'req-uuid'})};};
    const result=await core.sendToDeepgram(mockAdmin(changes),recording,'a'.repeat(64),fetcher);
    assert.equal(result,'req-uuid');
    const search=requests[0].url.searchParams;
    assert.equal(search.get('model'),'nova-3');
    assert.equal(search.get('language'),'pt-BR');
    for(const property of ['smart_format','utterances','punctuate','numerals']) assert.equal(search.get(property),'true');
    assert.equal(search.get('profanity_filter'),'false');
    assert.equal(search.get('diarize_model'),'latest');
    assert.equal(search.get('redact_usage'),'true');
    assert.equal(search.has('keywords'),false);
    assert.ok(search.getAll('keyterm').includes('Condomínio Vista Alegre'));
    assert.ok(search.getAll('keyterm').includes('João Oliveira'));
    assert.ok(search.getAll('keyterm').includes('Maria Alves'));
    assert.ok(search.getAll('keyterm').some(x=>x.includes('Elevadores Vale')));
    const audit=changes.find(x=>x.table==='assembly_recordings' && x.value.deepgram_keyterm_audit);
    assert.ok(audit);
    assert.equal(audit.value.deepgram_keyterm_audit.modelo,'nova-3');
    assert.deepEqual(audit.value.deepgram_keyterm_audit.termosIncluidos,search.getAll('keyterm'));
    assert.ok(audit.value.deepgram_keyterm_audit.tokensEstimados<=425);
  } finally {restore();}
});

test('fallback acontece só após rejeição por modelo incompatível; nova-2 usa keywords ponderadas',async()=>{
  const restore=envs(); const changes=[];
  try {
    const urls=[];
    const fetcher=async url=>{
      urls.push(url);
      if(url.searchParams.get('model')==='nova-3')return {ok:false,status:400,text:async()=> 'Selected Nova-3 model does not support keyterm prompting'};
      return {ok:true,json:async()=>({request_id:'req-fallback'})};
    };
    const id=await core.sendToDeepgram(mockAdmin(changes),recording,'b'.repeat(64),fetcher);
    assert.equal(id,'req-fallback');
    assert.deepEqual(urls.map(x=>x.searchParams.get('model')),['nova-3','nova-2']);
    assert.equal(urls[1].searchParams.has('keyterm'),false);
    assert.ok(urls[1].searchParams.getAll('keywords').some(x=>x.includes(':2')));
    assert.ok(changes.find(x=>x.table==='assembly_deepgram_jobs').value.fallback_to_nova2);
  } finally {restore();}
});

test('falhas gerais 429 não forçam mudança de modelo',async()=>{
  const restore=envs(); const changes=[]; let calls=0;
  try {
    await assert.rejects(core.sendToDeepgram(mockAdmin(changes),recording,'c'.repeat(64),async()=>{
      calls++;return {ok:false,status:429,text:async()=> 'Too many requests'};
    }),/HTTP 429/);
    assert.equal(calls,1);
  } finally {restore();}
});

test('migração registra termos por gravação e correções somente na observação da minuta',()=>{
  const sql=fs.readFileSync(require.resolve('../supabase/migrations/069_assembly_deepgram_keyterms.sql'),'utf8');
  assert.match(sql,/assembly_recordings[\s\S]*deepgram_keyterm_audit/);
  assert.match(sql,/assembly_minutes_drafts[\s\S]*observacoes_revisao/);
  const js=fs.readFileSync(require.resolve('../netlify/functions/assembly-minutes-indirect'),'utf8');
  assert.match(js,/const correctedRows = transcriptRows.map/);
  assert.match(js,/observacoes_revisao:observacoes/);
  assert.doesNotMatch(js,/assembly_transcripts'\)\.update\(/);
});

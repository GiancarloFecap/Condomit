'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path').resolve(__dirname, '../..');
const time = () => new Date(Date.now()-130000).toISOString();

async function testBrowserFlush() {
  const original = fs.readFileSync(`${path}/scripts/assembly/room/incremental-transcription.js`, 'utf8')
    .replace(/^import .*\n/gm, '').replace(/\bexport\s+(?=(async\s+)?function\b)/g, '').replace(/import\.meta\.url/g, '"file:///mock/transcription.js"');
  let stored = [], statusLabel = { textContent:'', title:'' };
  const window = { addEventListener:()=>{}, supabaseFetch:async (path,opt)=> { const data=JSON.parse(opt.body);stored.push(data);return {ok:true};}};
  const context = {
    window, document:{getElementById:()=>({querySelector:()=>statusLabel,dataset:{},title:''})},
    state:{assemblyId:57, room:{localParticipant:{identity:'speaker',trackPublications:new Map()}}},
    navigator:{},
    getLocalWhisper:async ()=>async ()=>({text:'Boa tarde, a proposta foi aprovada por todos.'}),
    setInterval:()=>1, clearInterval:()=>{}, setTimeout, clearTimeout,
    console, Math, Number, Float32Array, Array, String, Promise, Date, Buffer
  };
  vm.createContext(context);
  vm.runInContext(original,context,{filename:'transcription.js'});
  vm.runInContext('startIncrementalTranscription()',context);
  vm.runInContext('onPcmFrame({buffer:new Float32Array(12*16000).fill(0.22),rate:16000})',context);
  await vm.runInContext('stopIncrementalTranscription()',context);
  assert.equal(stored.length,1,'must persist queued audio on leave');
  assert.equal(stored[0].target_assembly_id,57);
  assert.equal(stored[0].transcript_source_value,'whisper_browser_local');
}

function buildMockScenario({state='active', old=true, attempts=0, existingVideo=false, failList=false}={}) {
  const updates=[]; let newEgress=0;
  const started=time();
  const recent = old ? [{id:1,egress_id:'egress_1',status:'gravando',started_at:started,recording_url:'storage://condomit-assembly-recordings/57/old.mp4'}] : [];
  const failed=Array.from({length:attempts},(_,i)=>({id:10+i,started_at:time()}));
  const q=(table)=>({
    select(cols){this.selectCols=cols;return this;},eq(key,val){this.filter=(this.filter||[]).concat([[key,val]]);return this;},
    in(){return this;},gte(){return this;},order(){return this;},limit(){return Promise.resolve({data:table==='assembly_recordings'?(this.filter||[]).some(([k,v])=>k==='status'&&v==='falhou')?failed:recent:[]});},
    maybeSingle(){return Promise.resolve({data:table==='scheduled_assemblies'?{id:57,cep:'12345-678',status:'em_andamento',livekit_room_name:'room-test'}: table==='users'?{email:'owner@sample.test',condominium:{cep:'12345-678'}}:null});},
    insert(item){return {select(){return {single(){return Promise.resolve({data:{id:42}});}}}};},
    update(item){updates.push(item);return {eq(){return {in(){return Promise.resolve({error:null});},then(resolve){return Promise.resolve({error:null}).then(resolve);}}}};},
  });
  const mockSupabase={
    auth:{getUser:async()=>({data:{user:{email:'owner@sample.test'}}})},
    from:q,
    storage:{from:()=>({list:async()=>({data:existingVideo?[{name:'old.mp4',metadata:{size:150000},updated_at:new Date().toISOString()}]:[]})})}
  };
  class FakeEgress {async listEgress(){if(failList)throw Error('offline');return state==='active'?[{egressId:'egress_1'}]:[];}
    async startRoomCompositeEgress(){newEgress++;return {egressId:'new_egress'};}}
  class EncodedFileOutput {constructor(o){this.value=o}};class S3Upload {constructor(o){this.value=o}}
  const Module=require('node:module'); const original=Module._load;
  Module._load=function(module,parent,isMain){
    if(module==='@supabase/supabase-js')return {createClient:()=>mockSupabase};
    if(module==='livekit-server-sdk')return {EgressClient:FakeEgress,EncodedFileOutput,S3Upload};
    return original.call(this,module,parent,isMain);
  };
  const pathname=`${path}/netlify/functions/assembly-recording.js`;
  delete require.cache[pathname];
  let handler;
  try{handler=require(pathname).handler;}finally{Module._load=original;}
  return {handler,updates,getNewEgress:()=>newEgress};
}

async function testServerHealth() {
  const prev=Object.assign({},process.env);
  Object.assign(process.env,{LIVEKIT_URL:'wss://fake.livekit.cloud',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret',CONDOMIT_S3_ACCESS_KEY:'access',CONDOMIT_S3_SECRET_KEY:'secret',CONDOMIT_S3_ENDPOINT:'https://fake.s3.local',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'});
  const invoke=async mock=>mock.handler({httpMethod:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({assembly_id:57})});
  let mock=buildMockScenario({state:'active'});let res=await invoke(mock);assert.equal(res.statusCode,200);assert.equal(mock.getNewEgress(),0);
  mock=buildMockScenario({state:'ended',existingVideo:true});res=await invoke(mock);assert.equal(res.statusCode,200);assert.equal(mock.updates[0].status,'concluido');assert.equal(mock.getNewEgress(),1);
  mock=buildMockScenario({state:'ended',existingVideo:false});res=await invoke(mock);assert.equal(res.statusCode,200);assert.equal(mock.updates[0].status,'falhou');assert.equal(mock.getNewEgress(),1);
  mock=buildMockScenario({state:'ended',attempts:3});res=await invoke(mock);assert.equal(res.statusCode,503);assert.equal(mock.getNewEgress(),0);
  mock=buildMockScenario({state:'ended',failList:true});res=await invoke(mock);assert.equal(res.statusCode,503);assert.equal(mock.getNewEgress(),0);
  Object.assign(process.env,prev);
}

(async()=>{await testBrowserFlush();await testServerHealth();console.log('OK: 6 casos, fila de transcrição / Egress ativo / vídeo recuperado / retomada / limite / LiveKit offline');})().catch(e=>{console.error(e);process.exitCode=1;});

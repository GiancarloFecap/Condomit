'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const originalLoad = Module._load;
Module._load = function(request, ...rest) {
  if (request === 'livekit-server-sdk') return { EgressClient: class {}, RoomServiceClient: class {} };
  return originalLoad.call(this, request, ...rest);
};
const { stopAssemblyEgress, hasConnectedAssemblyParticipants } = require('../netlify/functions/lib/assembly-recording-state.js');
Module._load = originalLoad;

function db(rows) {
  return {from: table => {
    assert.equal(table,'assembly_recordings');
    const query = {
      select:()=>query,eq:()=>query,in:()=>query,
      limit:async()=>({data:rows,error:null})
    };
    return query;
  }};
}

test('encerramento forçado para o Egress ativo antes de permitir finalizar a assembleia', async () => {
  const calls = [];
  const api = {
    listEgress:async ({egressId}) => [{egressId,status:1}],
    stopEgress:async egressId => {calls.push(egressId);}
  };
  const result = await stopAssemblyEgress(db([{id:1,egress_id:'EG-1',status:'gravando'}]),123,api);
  assert.deepEqual(calls,['EG-1']);
  assert.equal(result.requested,1);
  assert.equal(result.pending,0);
  assert.equal(result.errors.length,0);
});

test('não interrompe a gravação em STARTING; aguarda a transição para ACTIVE',async()=>{
  const stops = [];
  let count = 0;
  const api = {
    listEgress:async({egressId})=>[{egressId,status:++count < 2 ? 0 : 1}],
    stopEgress:async(id)=>stops.push(id)
  };
  const result = await stopAssemblyEgress(db([{id:1,egress_id:'EG-1',status:'pendente'}]),123,api,{maxWaitMs:1200});
  assert.equal(result.pending,0);
  assert.equal(result.requested,1);
  assert.deepEqual(stops,['EG-1']);
});

test('se a gravação ainda não retornou egress_id, marca como pendente e não autoriza encerramento',async()=>{
  const api={listEgress:async()=>{throw new Error('não deveria consultar');},stopEgress:async()=>{throw new Error('não deveria parar');}};
  const result = await stopAssemblyEgress(db([{id:1,egress_id:null,status:'pendente'}]),123,api,{maxWaitMs:10});
  assert.equal(result.pending,1);
  assert.equal(result.requested,0);
});

test('não envia STOP duplicado para Egress já encerrando',async()=>{
  const api={listEgress:async({egressId})=>[{egressId,status:2}],stopEgress:async()=>{throw new Error('não deve chamar STOP');}};
  const result=await stopAssemblyEgress(db([{id:1,egress_id:'EG-1',status:'gravando'}]),123,api);
  assert.equal(result.pending,0);
  assert.equal(result.requested,0);
});

test('não finaliza o banco se LiveKit devolver falha ao encerrar vídeo', async()=>{
  const api={listEgress:async({egressId})=>[{egressId,status:1}],stopEgress:async()=>{throw new Error('rede temporariamente indisponível');}};
  const result=await stopAssemblyEgress(db([{id:1,egress_id:'EG-1',status:'gravando'}]),123,api);
  assert.equal(result.errors.length,1);
});

test('finalização forçada usa endpoint que para Egress; RPC antiga protegida na migração',()=>{
  const frontend=readFileSync(join(__dirname,'../scripts/assembleia.js'),'utf8');
  const server=readFileSync(join(__dirname,'../netlify/functions/assembly-action.js'),'utf8');
  const sql=readFileSync(join(__dirname,'../supabase/migrations/066_assembly_speaker_boundaries_safe_finalization.sql'),'utf8');
  assert.match(frontend,/\/\.netlify\/functions\/assembly-action/);
  assert.match(frontend,/action: 'end'/);
  assert.doesNotMatch(frontend,/\/rpc\/condomit_finalize_assembly/);
  const from=server.indexOf('async function handleEnd(');
  const stop=server.indexOf('await stopAssemblyEgress(',from);
  const update=server.indexOf(".from('scheduled_assemblies')",from);
  assert.ok(from>=0 && stop>from && update>stop);
  assert.match(sql,/r\.status IN \('pendente', 'gravando'\)/);
});

test('impede finalizar sem Egress quando ainda existem pessoas conectadas no LiveKit', () => {
  const source=readFileSync(join(__dirname,'../netlify/functions/assembly-action.js'),'utf8');
  assert.match(source, /!recording\.examined/);
  assert.match(source, /await hasConnectedAssemblyParticipants\(assembly\)/);
  assert.match(source, /nenhuma gravação ativa foi confirmada/);
});

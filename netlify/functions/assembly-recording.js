'use strict';
const { createClient } = require('@supabase/supabase-js');
const { EgressClient, EncodedFileOutput, S3Upload } = require('livekit-server-sdk');
const { reconcileAssembly } = require('./lib/assembly-recording-state');
const env = process.env;
const reply = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });
const cep = v => String(v || '').replace(/\D/g, '');
const bucket = 'condomit-assembly-recordings';
const ready = () => ['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','CONDOMIT_S3_ACCESS_KEY','CONDOMIT_S3_SECRET_KEY','CONDOMIT_S3_ENDPOINT'].every(key => !!env[key]);
const db = () => createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, {error:'Método não permitido.'});
  try {
    const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply(401, {error:'Autenticação necessária.'});
    const body = JSON.parse(event.body || '{}');
    const assemblyId = Number(body.assembly_id);
    const action = String(body.action || 'start');
    if (!Number.isSafeInteger(assemblyId) || assemblyId <= 0) return reply(400, {error:'Assembleia inválida.'});
    const supabase = db();
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user?.email) return reply(401, {error:'Sessão inválida.'});
    const email = auth.user.email.toLowerCase();
    const [{data: assembly}, {data: links}, {data: profile}] = await Promise.all([
      supabase.from('scheduled_assemblies').select('id,cep,status,livekit_room_name').eq('id',assemblyId).maybeSingle(),
      supabase.from('user_condominiums').select('condominium_id').eq('user_email',email),
      supabase.from('users').select('email,condominium').eq('email',email).maybeSingle()
    ]);
    if (!assembly) return reply(404, {error:'Assembleia não encontrada.'});
    let cachedCondo = profile?.condominium;
    if (typeof cachedCondo === 'string') { try { cachedCondo = JSON.parse(cachedCondo); } catch (_) { cachedCondo = null; } }
    const ids = [ ...(links || []).map(x => x.condominium_id), cachedCondo?.cep, cachedCondo?.condominium_id ];
    if (!ids.some(value => cep(value) === cep(assembly.cep))) return reply(403, {error:'Usuário não pertence ao condomínio desta assembleia.'});
    if (action === 'status') {
      const recordings = await reconcileAssembly(supabase, assemblyId, { limit: 5 });
      return reply(200, { status: recordings[0]?.status || 'ausente', latest: recordings[0] || null, recordings });
    }
    if (action !== 'start') return reply(400, {error:'Ação inválida.'});
    if (assembly.status !== 'em_andamento') return reply(409, {error:'A assembleia não está em andamento.'});
    if (!ready()) return reply(503, {error:'Configure as credenciais LiveKit Egress e S3 na Netlify.'});
    const existing = await reconcileAssembly(supabase, assemblyId, { limit: 3 });
    if (existing[0]?.status === 'falhou' && !body.retry_failed) return reply(200, {status:'falhou',active:false,diagnostic:existing[0].diagnostic,recording_id:existing[0].recording_id});
    const roomName = String(assembly.livekit_room_name || `assembleia-${assembly.id}-${cep(assembly.cep)}`);
    const livekit = new EgressClient(env.LIVEKIT_URL.replace(/^wss:/,'https:').replace(/^ws:/,'http:'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    const {data: current} = await supabase.from('assembly_recordings').select('id,egress_id,status,started_at').eq('assembly_id',assemblyId).in('status',['pendente','gravando']).order('created_at',{ascending:false}).limit(1);
    if (current?.length) {
      const previous = current[0];
      const stale = previous.status === 'pendente' && !previous.egress_id &&
        Date.now() - new Date(previous.started_at || 0).getTime() > 120000;
      if (!stale) return reply(200, {status:previous.status, recording_id:previous.id, active:true});
      const {error: staleError} = await supabase.from('assembly_recordings').update({status:'falhou'}).eq('id',previous.id).eq('status','pendente');
      if (staleError) throw staleError;
    }
    const storagePath = `${assemblyId}/${crypto.randomUUID()}.mp4`;
    const {data: record, error: insertedError} = await supabase.from('assembly_recordings').insert({assembly_id:assemblyId,cep:assembly.cep,livekit_room_name:roomName,recording_url:`storage://${bucket}/${storagePath}`,recording_type:'room_composite',status:'pendente',started_by:email,started_at:new Date().toISOString()}).select('id').single();
    if (insertedError) {
      if (insertedError.code === '23505') return reply(200, {status:'pendente',active:true});
      throw insertedError;
    }
    try {
      const output = new EncodedFileOutput({ filepath:storagePath, output: {case:'s3', value:new S3Upload({accessKey:env.CONDOMIT_S3_ACCESS_KEY, secret:env.CONDOMIT_S3_SECRET_KEY,endpoint:env.CONDOMIT_S3_ENDPOINT,region:env.CONDOMIT_S3_REGION || 'us-east-1',bucket,forcePathStyle:true})} });
      const info = await livekit.startRoomCompositeEgress(roomName, output, {layout:'grid'});
      const {error: updateError} = await supabase.from('assembly_recordings').update({egress_id:info.egressId,status:'gravando'}).eq('id',record.id);
      if (updateError) {
        await livekit.stopEgress(info.egressId).catch(()=>{});
        throw updateError;
      }
      return reply(200, {status:'gravando',active:true,recording_id:record.id});
    } catch (error) {
      await supabase.from('assembly_recordings').update({status:'falhou'}).eq('id',record.id);
      throw error;
    }
  } catch(error) {
    console.error('[ASSEMBLY EGRESS START]', error);
    return reply(500, {error:'Não foi possível iniciar a gravação no servidor. Verifique as configurações do LiveKit Egress e do Storage.'});
  }
};

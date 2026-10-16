'use strict';
const { createClient } = require('@supabase/supabase-js');
const { EgressClient, EncodedFileOutput, S3Upload } = require('livekit-server-sdk');
const env = process.env;
const reply = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });
const cep = v => String(v || '').replace(/\D/g, '');
const bucket = 'condomit-assembly-recordings';
const ready = () => ['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','CONDOMIT_S3_ACCESS_KEY','CONDOMIT_S3_SECRET_KEY','CONDOMIT_S3_ENDPOINT'].every(key => !!env[key]);
const db = () => createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, {error:'Método não permitido.'});
  if (!ready()) return reply(503, {error:'A gravação em servidor ainda não está configurada. Configure o LiveKit Egress e as credenciais S3 privadas na Netlify.'});
  try {
    const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply(401, {error:'Autenticação necessária.'});
    const body = JSON.parse(event.body || '{}');
    const assemblyId = Number(body.assembly_id);
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
    if (!assembly || !['em_andamento'].includes(assembly.status)) return reply(409, {error:'A assembleia não está em andamento.'});
    let cachedCondo = profile?.condominium;
    if (typeof cachedCondo === 'string') { try { cachedCondo = JSON.parse(cachedCondo); } catch (_) { cachedCondo = null; } }
    const ids = [ ...(links || []).map(x => x.condominium_id), cachedCondo?.cep, cachedCondo?.condominium_id ];
    if (!ids.some(value => cep(value) === cep(assembly.cep))) return reply(403, {error:'Usuário não pertence ao condomínio desta assembleia.'});
    const roomName = String(assembly.livekit_room_name || `assembleia-${assembly.id}-${cep(assembly.cep)}`);
    const livekit = new EgressClient(env.LIVEKIT_URL.replace(/^wss:/,'https:').replace(/^ws:/,'http:'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    // EgressClient confirma se a gravação está REALMENTE ativa. Uma linha "gravando"
    // pode permanecer no banco mesmo depois de falha ou webhook perdido.
    const {data: current, error: currentError} = await supabase.from('assembly_recordings')
      .select('id,egress_id,status,started_at,recording_url')
      .eq('assembly_id',assemblyId).in('status',['pendente','gravando'])
      .order('created_at',{ascending:false}).limit(2);
    if (currentError) throw currentError;
    const now = Date.now();
    const recent = (current || [])[0];
    if (recent) {
      const elapsed = now - new Date(recent.started_at || now).getTime();
      if (recent.status === 'gravando' && recent.egress_id) {
        let activeEgress = false;
        try {
          const activeList = await livekit.listEgress({roomName});
          activeEgress = (activeList || []).some(info => info.egressId === recent.egress_id);
        } catch (healthError) {
          console.error('[ASSEMBLY EGRESS HEALTH] Sem confirmação do LiveKit:', healthError);
          // Se o LiveKit não responde, não iniciamos uma segunda gravação duplicada.
          return reply(503, {error:'Não foi possível conferir se a gravação permanece ativa no LiveKit.'});
        }
        if (activeEgress) return reply(200,{status:'gravando',recording_id:recent.id,active:true});
        if (elapsed < 90000) return reply(200,{status:'pendente',recording_id:recent.id,active:false});
      } else if (elapsed < 90000) {
        return reply(200,{status:'pendente',recording_id:recent.id,active:false});
      }
      // Antes de classificar como falha, verificar se existe o vídeo no Storage.
      const match = String(recent.recording_url||'').match(/^storage:\/\/condomit-assembly-recordings\/(\d+)\/(.+)$/);
      let existingFile = null;
      if (match && Number(match[1]) === assemblyId) {
        const {data:found,error:storageError} = await supabase.storage.from(bucket).list(String(assemblyId),{limit:100});
        if (storageError) throw storageError;
        existingFile = (found||[]).find(file=>file.name===match[2]);
      }
      const fileBytes = Number(existingFile?.metadata?.size||existingFile?.metadata?.contentLength||0);
      if (fileBytes > 8192) {
        const {error:recoveredError} = await supabase.from('assembly_recordings').update({status:'concluido',file_size_bytes:fileBytes,ended_at:existingFile.updated_at||new Date().toISOString()}).eq('id',recent.id).in('status',['pendente','gravando']);
        if (recoveredError) throw recoveredError;
      } else {
        const {error:staleError} = await supabase.from('assembly_recordings').update({status:'falhou',ended_at:new Date().toISOString()}).eq('id',recent.id).in('status',['pendente','gravando']);
        if (staleError) throw staleError;
        console.warn('[ASSEMBLY EGRESS HEALTH] Gravação interrompida sem arquivo recuperável:', {assemblyId,recordingId:recent.id,egressId:recent.egress_id});
      }
    }
    // Evita reinícios infinitos (e custos inesperados) se a configuração do Egress falhar.
    const {data:failed, error:failedError} = await supabase.from('assembly_recordings')
      .select('id,started_at').eq('assembly_id',assemblyId).eq('status','falhou')
      .gte('started_at',new Date(now-60*60*1000).toISOString())
      .order('started_at',{ascending:false}).limit(4);
    if (failedError) throw failedError;
    if ((failed||[]).length >= 3) return reply(503,{status:'falhou',error:'Três tentativas de gravação falharam nesta hora. Verifique o Egress e o S3 para evitar cobranças repetidas.'});
    if (failed?.length && now - new Date(failed[0].started_at).getTime() < 110000) {
      return reply(200,{status:'falhou',active:false,error:'A gravação falhou. Nova tentativa automática após intervalo de segurança.'});
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

'use strict';
const { createClient } = require('@supabase/supabase-js');
const { RoomServiceClient, TrackSource } = require('livekit-server-sdk');
const reply = (statusCode, body) => ({statusCode, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body:JSON.stringify(body)});
const norm = v => String(v || '').replace(/\D/g,'');
const url = () => String(process.env.LIVEKIT_URL || '').replace(/^wss:/,'https:').replace(/^ws:/,'http:');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405,{error:'Método não permitido.'});
  try {
    if (!url() || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return reply(503,{error:'LiveKit não configurado.'});
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i,'');
    if (!jwt) return reply(401,{error:'Faça login para moderar.'});
    const {assembly_id, identity, action} = JSON.parse(event.body || '{}');
    const assemblyId = Number(assembly_id);
    const target = String(identity || '').trim();
    if (!Number.isSafeInteger(assemblyId) || assemblyId <= 0 || !target || target.length > 180 || !['remove','mute_microphone','mute_camera'].includes(action)) return reply(400,{error:'Solicitação inválida.'});
    const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError} = await db.auth.getUser(jwt);
    if (authError || !user?.id || !user?.email) return reply(401,{error:'Sessão inválida.'});
    const email = user.email.toLowerCase();
    const [{data:assembly,error:assemblyError},{data:profile},{data:links}] = await Promise.all([
      db.from('scheduled_assemblies').select('id,cep,created_by,status,livekit_room_name').eq('id',assemblyId).maybeSingle(),
      db.from('users').select('email,user_type,condominium').eq('email',email).maybeSingle(),
      db.from('user_condominiums').select('condominium_id').eq('user_email',email)
    ]);
    if (assemblyError || !assembly || !['em_andamento','agendada'].includes(assembly.status)) return reply(409,{error:'Assembleia indisponível.'});
    let condo = profile?.condominium;
    if (typeof condo === 'string') {try {condo=JSON.parse(condo);} catch (_) {condo={};}}
    const belongs = [...(links||[]).map(x=>x.condominium_id),condo?.cep,condo?.condominium_id].some(x=>norm(x)===norm(assembly.cep));
    const manager = String(profile?.user_type||'').toLowerCase()==='sindico' || String(assembly.created_by||'').toLowerCase()===email;
    if (!belongs || !manager) return reply(403,{error:'Apenas o síndico deste condomínio pode moderar.'});
    const targetId = `user-${user.id}-assembly-${assemblyId}`;
    if (target === targetId || !new RegExp(`^user-[a-f0-9-]{36}-assembly-${assemblyId}$`, 'i').test(target)) return reply(403,{error:'Participante inválido ou não é permitido moderar a própria conta.'});
    const room = String(assembly.livekit_room_name || `assembleia-${assembly.id}-${norm(assembly.cep)}`);
    const livekit = new RoomServiceClient(url(), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    const participant = await livekit.getParticipant(room,target);
    if (!participant || !participant.identity) return reply(404,{error:'Participante não está conectado.'});
    if (action === 'remove') {
      await livekit.removeParticipant(room, target);
    } else {
      const source = action === 'mute_microphone' ? TrackSource.MICROPHONE : TrackSource.CAMERA;
      const tracks = (participant.tracks||[]).filter(track => track.source === source && !track.muted);
      for (const track of tracks) await livekit.mutePublishedTrack(room,target,track.sid,true);
      if (!tracks.length) return reply(200,{ok:true,message:'Este participante já está com o dispositivo desativado.'});
    }
    return reply(200,{ok:true,message: action === 'remove' ? 'Participante removido da chamada.' : action === 'mute_camera' ? 'Câmera do participante desativada na chamada.' : 'Microfone do participante silenciado na chamada.'});
  } catch(error) {
    console.error('[ASSEMBLY MODERATE]',error);
    return reply(500,{error:'Não foi possível concluir a moderação. Confira a conexão do LiveKit.'});
  }
};

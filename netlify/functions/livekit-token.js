const { createClient } = require('@supabase/supabase-js');
const { AccessToken } = require('livekit-server-sdk');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function httpError(statusCode, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function getUserCondominiumCEP(user) {
  let cep = null;
  if (user && user.condominium) {
    if (typeof user.condominium === 'string') {
      try {
        const parsed = JSON.parse(user.condominium);
        cep = parsed.cep || parsed.condominium_id || null;
      } catch (e) {
        cep = user.condominium;
      }
    } else if (typeof user.condominium === 'object') {
      cep = user.condominium.cep || user.condominium.condominium_id || null;
    }
  }
  return cep;
}

function isLoopbackHost(hostname) {
  const value = String(hostname || '').trim().toLowerCase();
  return value === 'localhost'
    || value === '127.0.0.1'
    || value === '0.0.0.0'
    || value === '::1'
    || value === '[::1]';
}

function parseHostHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) return { hostname: '', port: '' };
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return {
      hostname: end >= 0 ? raw.slice(1, end) : raw,
      port: end >= 0 && raw[end + 1] === ':' ? raw.slice(end + 2) : '',
    };
  }
  const lastColon = raw.lastIndexOf(':');
  if (lastColon > -1 && raw.indexOf(':') === lastColon) {
    return { hostname: raw.slice(0, lastColon), port: raw.slice(lastColon + 1) };
  }
  return { hostname: raw, port: '' };
}

function resolveLivekitUrl(event) {
  if (!LIVEKIT_URL) {
    return { error: 'Servidor de vídeo não configurado. Contate o administrador.' };
  }

  let parsed;
  try {
    parsed = new URL(LIVEKIT_URL);
  } catch (error) {
    return { error: 'LIVEKIT_URL inválida no ambiente do servidor.' };
  }

  if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
  if (parsed.protocol === 'https:') parsed.protocol = 'wss:';

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return { error: 'LIVEKIT_URL deve usar ws:// ou wss://.' };
  }

  if (isLoopbackHost(parsed.hostname)) {
    const forwardedHost = event.headers['x-forwarded-host'] || event.headers['X-Forwarded-Host'] || event.headers.host || event.headers.Host || '';
    const forwardedProto = String(event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'] || '').trim().toLowerCase();
    const requestHost = parseHostHeader(forwardedHost);

    if (!requestHost.hostname || isLoopbackHost(requestHost.hostname)) {
      return {
        error: 'LIVEKIT_URL aponta para localhost e não pode ser usada entre dispositivos. Configure uma URL pública do LiveKit.',
      };
    }

    parsed.hostname = requestHost.hostname;
    if (!parsed.port) {
      parsed.port = requestHost.port || (forwardedProto === 'https' ? '443' : '80');
    }
    parsed.protocol = forwardedProto === 'https' ? 'wss:' : 'ws:';
  }

  return { url: parsed.toString().replace(/\/$/, '') };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return httpError(405, 'Método não permitido. Use POST.');
  }

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return httpError(500, 'Servidor de vídeo não configurado. Contate o administrador.');
  }

  const resolvedLivekit = resolveLivekitUrl(event);
  if (resolvedLivekit.error) {
    return httpError(500, resolvedLivekit.error);
  }
  const livekitUrl = resolvedLivekit.url;

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return httpError(400, 'Corpo da requisição inválido.');
  }

  const { assembly_id } = body;
  if (!assembly_id) {
    return httpError(400, 'ID da assembleia é obrigatório.');
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return httpError(401, 'Autenticação necessária.');
  }
  const token = authHeader.substring(7);

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData || !authData.user) {
    return httpError(401, 'Token de autenticação inválido ou expirado.');
  }
  const supabaseUser = authData.user;
  const userEmail = supabaseUser.email;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('name, email, user_type, cpf, phone, condominium')
    .eq('email', userEmail)
    .single();

  if (userError || !user) {
    return httpError(401, 'Usuário não encontrado no sistema.');
  }

  const { data: userCondoData } = await supabase
    .from('user_condominiums')
    .select('condominium_id, apartment, block')
    .eq('user_email', userEmail)
    .maybeSingle();

  let userCEP = null;
  if (userCondoData && userCondoData.condominium_id) {
    userCEP = userCondoData.condominium_id;
  } else {
    userCEP = getUserCondominiumCEP(user);
  }

  if (!userCEP) {
    return httpError(403, 'Usuário não possui condomínio associado.');
  }

  const assemblyIdNum = parseInt(assembly_id, 10);
  if (isNaN(assemblyIdNum)) {
    return httpError(400, 'ID da assembleia inválido.');
  }

  const { data: assembly, error: assemblyError } = await supabase
    .from('scheduled_assemblies')
    .select(`
      id, public_id, cep, title, description, date, start_time, end_time,
      status, created_by, assembly_type, expected_duration_minutes,
      livekit_room_name, started_at, ended_at
    `)
    .eq('id', assemblyIdNum)
    .single();

  if (assemblyError || !assembly) {
    return httpError(404, 'Assembleia não encontrada.');
  }

  if (assembly.cep !== userCEP) {
    return httpError(403, 'Esta assembleia pertence a outro condomínio.');
  }

  // #region debug-point B:assembly-validation
  fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"B",location:"netlify/functions/livekit-token.js:assembly-validation",msg:"[DEBUG] validated assembly and user for token generation",data:{assemblyId:assembly.id,assemblyCep:assembly.cep,userCep:userCEP,status:assembly.status,userEmail:userEmail},ts:Date.now()})}).catch(()=>{});
  // #endregion

  const validStatuses = ['agendada', 'em_andamento'];
  if (!validStatuses.includes(assembly.status)) {
    if (assembly.status === 'encerrada') {
      return httpError(409, 'Assembleia já foi encerrada.');
    }
    if (assembly.status === 'cancelada') {
      return httpError(409, 'Assembleia foi cancelada.');
    }
    return httpError(409, 'Status da assembleia não permite entrada.');
  }

  const isOrganizer = assembly.created_by === userEmail;
  const isSindico = user.user_type === 'sindico';
  const isPorteiro = user.user_type === 'porteiro';
  const isMorador = user.user_type === 'morador';

  if (isPorteiro) {
    return httpError(403, 'Porteiros não podem participar de assembleias.');
  }

  if (!isMorador && !isSindico && !isOrganizer) {
    return httpError(403, 'Tipo de usuário não autorizado.');
  }

  const canPublish = true;
  const canSubscribe = true;
  const canPublishSources = ['camera', 'microphone'];
  if (isOrganizer || isSindico) {
    canPublishSources.push('screen_share');
  }
  const canManage = isOrganizer || isSindico;

  const participantIdentity = `${userEmail}-${assembly.id}`;
  const participantName = user.name || userEmail;

  let roomName = assembly.livekit_room_name;
  if (!roomName) {
    roomName = `assembleia-${assembly.id}-${assembly.cep.replace(/\D/g, '')}`;
    const { error: updateError } = await supabase
      .from('scheduled_assemblies')
      .update({ livekit_room_name: roomName, updated_at: new Date().toISOString() })
      .eq('id', assembly.id);
    if (updateError) {
      return httpError(500, 'Erro ao configurar sala da assembleia.');
    }
  }

  // #region debug-point A:livekit-config
  fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"A",location:"netlify/functions/livekit-token.js:room-config",msg:"[DEBUG] resolved livekit url and room name",data:{assemblyId:assembly.id,livekitUrl:livekitUrl,roomName:roomName,usedPersistedRoom:Boolean(assembly.livekit_room_name)},ts:Date.now()})}).catch(()=>{});
  // #endregion

  const ttlMinutes = 8 * 60;
  let at;
  try {
    at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName,
      ttl: `${ttlMinutes}m`,
    });
  } catch (e) {
    return httpError(500, 'Erro ao criar credencial de acesso.');
  }

  at.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: false,
    roomList: false,
    roomRecord: canManage,
    roomAdmin: canManage,
    canPublish,
    canSubscribe,
    canPublishData: true,
    canPublishSources,
    canUpdateOwnMetadata: true,
    canSubscribeMetrics: canManage,
    hidden: false,
    canUpdateRoomMetadata: canManage,
    canRemoveParticipants: canManage,
    canMute: canManage,
  });

  at.metadata = JSON.stringify({
    user_email: userEmail,
    user_name: participantName,
    user_type: user.user_type,
    user_cpf: user.cpf || null,
    condominium_cep: userCEP,
    assembly_id: assembly.id,
    is_organizer: isOrganizer,
    is_sindico: isSindico,
    can_manage: canManage,
  });

  let signedToken;
  try {
    signedToken = await at.toJwt();
  } catch (e) {
    return httpError(500, 'Erro ao assinar credencial de acesso.');
  }

  // #region debug-point C:token-issued
  fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"C",location:"netlify/functions/livekit-token.js:token-issued",msg:"[DEBUG] issued livekit token",data:{assemblyId:assembly.id,identity:participantIdentity,participantName:participantName,roomName:roomName,livekitUrl:livekitUrl,canPublishSources:canPublishSources},ts:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    await supabase.from('assembly_event_logs').insert({
      assembly_id: assembly.id,
      cep: userCEP,
      event_type: 'participant_joined_token',
      event_payload: {
        user_email: userEmail,
        user_name: participantName,
        user_type: user.user_type,
        room_name: roomName,
      },
      created_by: userEmail,
      created_at: new Date().toISOString(),
    });
  } catch (e) {}

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify({
      token: signedToken,
      url: livekitUrl,
      room: roomName,
      identity: participantIdentity,
      user: {
        email: userEmail,
        name: participantName,
        type: user.user_type,
        cep: userCEP,
      },
      assembly: {
        id: assembly.id,
        public_id: assembly.public_id,
        title: assembly.title,
        status: assembly.status,
        cep: assembly.cep,
      },
      permissions: {
        canPublish,
        canSubscribe,
        canPublishSources,
        canManage,
        canScreenShare: canPublishSources.includes('screen_share'),
        canRecord: canManage,
        canRemoveParticipants: canManage,
        canMute: canManage,
        isOrganizer,
        isSindico,
      },
    }),
  };
};

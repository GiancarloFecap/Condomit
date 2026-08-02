import { createClient } from '@supabase/supabase-js';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
}

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

export function createResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

export function ok(body, extraHeaders = {}) {
  return createResponse(200, body, extraHeaders);
}

export function fail(statusCode, message, details = {}, extraHeaders = {}) {
  return createResponse(statusCode, { error: message, ...details }, extraHeaders);
}

export function allowCors(methods = 'GET, POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': '86400'
  };
}

export function handleOptions(methods = 'GET, POST, OPTIONS') {
  return {
    statusCode: 204,
    headers: {
      ...allowCors(methods),
      'Cache-Control': 'no-store'
    },
    body: ''
  };
}

export function normalizeUserType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('sind')) return 'sindico';
  if (raw.includes('mora')) return 'morador';
  if (raw.includes('porteir')) return 'porteiro';
  return raw || 'morador';
}

export async function parseJsonBody(event) {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON inválido no corpo da requisição');
  }
}

function extractBearerToken(event) {
  const raw = event?.headers?.authorization || event?.headers?.Authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function escapeLike(value) {
  return String(value || '').replace(/[%_,]/g, '');
}

function extractCepFromProfile(profile) {
  if (!profile) return '';
  if (profile.condominium && typeof profile.condominium === 'object') {
    return String(profile.condominium.cep || profile.condominium.condominium_id || '').trim();
  }
  if (profile.condominium && typeof profile.condominium === 'string') {
    try {
      const parsed = JSON.parse(profile.condominium);
      return String(parsed?.cep || parsed?.condominium_id || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

async function getAuthUserFromToken(token) {
  const { data, error } = await authSupabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  }
  return data.user;
}

async function getUserProfileByEmail(email) {
  const { data, error } = await adminSupabase
    .from('users')
    .select('*')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('Não foi possível localizar o perfil do usuário.');
  if (!data) throw new Error('Perfil do usuário não encontrado.');
  return data;
}

async function getUserCondoMembership(email) {
  const { data } = await adminSupabase
    .from('user_condominiums')
    .select('*')
    .eq('user_email', email)
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function getAuthenticatedContext(event) {
  const token = extractBearerToken(event);
  if (!token) {
    throw new Error('Cabeçalho Authorization ausente.');
  }

  const authUser = await getAuthUserFromToken(token);
  const email = String(authUser.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Não foi possível identificar o e-mail do usuário autenticado.');
  }

  const profile = await getUserProfileByEmail(email);
  const membership = await getUserCondoMembership(email);
  const condominiumCep = String(
    membership?.condominium_id ||
    extractCepFromProfile(profile)
  ).trim();

  return {
    token,
    authUser,
    email,
    profile,
    membership,
    role: normalizeUserType(profile.user_type || profile.type),
    condominiumCep,
    displayName: String(profile.name || authUser.user_metadata?.name || email.split('@')[0]).trim()
  };
}

export async function getAssemblyByPublicId(assemblyId) {
  const value = String(assemblyId || '').trim();
  if (!value) throw new Error('assemblyId é obrigatório.');

  let query = adminSupabase.from('scheduled_assemblies').select('*').limit(1);
  if (/^\d+$/.test(value)) {
    query = query.eq('id', Number(value));
  } else {
    query = query.eq('public_id', value);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Não foi possível localizar a assembleia.');
  if (!data) throw new Error('Assembleia não encontrada.');
  return data;
}

export function ensureAssemblyAccess(context, assembly) {
  const assemblyCep = String(assembly?.cep || '').trim();
  if (!assemblyCep || assemblyCep !== context.condominiumCep) {
    throw new Error('Você não tem permissão para acessar assembleias de outro condomínio.');
  }
}

export function ensureSyndico(context) {
  if (context.role !== 'sindico') {
    throw new Error('Apenas o síndico pode realizar esta ação.');
  }
}

export function getAssemblyRoomName(assembly) {
  return String(assembly.livekit_room_name || `assembleia-${assembly.public_id || assembly.id}`).trim();
}

export async function persistAssemblyRoomName(assembly, roomName) {
  if (assembly.livekit_room_name === roomName) return roomName;
  const { error } = await adminSupabase
    .from('scheduled_assemblies')
    .update({ livekit_room_name: roomName })
    .eq('id', assembly.id);

  if (error) throw new Error('Não foi possível salvar a sala da assembleia.');
  assembly.livekit_room_name = roomName;
  return roomName;
}

export async function ensureRoomExists(roomName, metadata = '') {
  try {
    const rooms = await roomService.listRooms([roomName]);
    if (Array.isArray(rooms) && rooms.length) return;
  } catch (_) {}

  await roomService.createRoom({
    name: roomName,
    emptyTimeout: 300,
    departureTimeout: 90,
    maxParticipants: 200,
    metadata
  });
}

export async function buildAssemblyMetadata(assembly) {
  const { data } = await adminSupabase
    .from('condominiums')
    .select('condominium_name')
    .eq('cep', assembly.cep)
    .limit(1)
    .maybeSingle();

  return JSON.stringify({
    assemblyId: assembly.public_id || assembly.id,
    assemblyNumericId: assembly.id,
    title: assembly.title,
    cep: assembly.cep,
    condominiumName: data?.condominium_name || null
  });
}

export async function createLiveKitToken(context, assembly, roomName) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: String(context.authUser.id),
    name: context.displayName,
    ttl: '2h',
    metadata: JSON.stringify({
      email: context.email,
      userType: context.role,
      assemblyId: assembly.public_id || assembly.id,
      assemblyNumericId: assembly.id,
      cep: context.condominiumCep
    })
  });

  const grants = {
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublishData: true,
    canPublish: true,
    roomAdmin: context.role === 'sindico'
  };

  at.addGrant(grants);
  return await at.toJwt();
}

export async function logAssemblyEvent(assemblyId, eventType, createdBy, eventPayload = {}) {
  await adminSupabase.from('assembly_event_logs').insert({
    assembly_id: assemblyId,
    event_type: eventType,
    created_by: createdBy || null,
    event_payload: eventPayload
  });
}

export async function getAssemblyState(context, assembly) {
  const [condoResult, chatResult, requestsResult, pollsResult, pollOptionsResult, votesResult, attendanceResult] = await Promise.all([
    adminSupabase.from('condominiums').select('condominium_name').eq('cep', assembly.cep).limit(1).maybeSingle(),
    adminSupabase.from('assembly_chat_messages').select('*').eq('assembly_id', assembly.id).order('created_at', { ascending: true }).limit(100),
    adminSupabase.from('assembly_speaking_requests').select('*').eq('assembly_id', assembly.id).order('requested_at', { ascending: true }),
    adminSupabase.from('assembly_polls').select('*').eq('assembly_id', assembly.id).order('created_at', { ascending: false }),
    adminSupabase.from('assembly_poll_options').select('*').order('display_order', { ascending: true }),
    adminSupabase.from('assembly_votes').select('*').eq('assembly_id', assembly.id),
    adminSupabase.from('assembly_attendance').select('*').eq('assembly_id', assembly.id).order('joined_at', { ascending: false }).limit(100)
  ]);

  const polls = Array.isArray(pollsResult.data) ? pollsResult.data : [];
  const options = (Array.isArray(pollOptionsResult.data) ? pollOptionsResult.data : []).filter((item) =>
    polls.some((poll) => poll.id === item.poll_id)
  );
  const votes = Array.isArray(votesResult.data) ? votesResult.data : [];

  return {
    assembly: {
      id: assembly.public_id || assembly.id,
      numericId: assembly.id,
      title: assembly.title,
      description: assembly.description || '',
      date: assembly.date,
      startTime: assembly.start_time,
      endTime: assembly.end_time,
      status: assembly.status,
      livekitRoomName: getAssemblyRoomName(assembly),
      startedAt: assembly.started_at,
      endedAt: assembly.ended_at,
      createdBy: assembly.created_by,
      cep: assembly.cep
    },
    condominium: {
      cep: assembly.cep,
      name: condoResult.data?.condominium_name || 'Condomínio'
    },
    currentUser: {
      email: context.email,
      name: context.displayName,
      role: context.role,
      identity: String(context.authUser.id)
    },
    chatMessages: chatResult.data || [],
    speakingRequests: requestsResult.data || [],
    polls,
    pollOptions: options,
    votes,
    attendance: attendanceResult.data || []
  };
}

export async function getOpenAttendanceByIdentity(assemblyId, userEmail) {
  const { data, error } = await adminSupabase
    .from('assembly_attendance')
    .select('*')
    .eq('assembly_id', assemblyId)
    .eq('user_email', userEmail)
    .is('left_at', null)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('Não foi possível consultar a presença atual.');
  return data || null;
}

export { adminSupabase, roomService };

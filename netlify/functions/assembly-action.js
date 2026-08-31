const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_ACTIONS = ['start', 'end', 'cancel', 'start_poll', 'end_poll'];
const ASSEMBLY_STATUS = {
  SCHEDULED: 'agendada',
  IN_PROGRESS: 'em_andamento',
  ENDED: 'encerrada',
  CANCELED: 'cancelada',
};
const POLL_STATUS = {
  DRAFT: 'rascunho',
  SCHEDULED: 'agendada',
  OPEN: 'aberta',
  CLOSED: 'encerrada',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function httpError(statusCode, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

function successResponse(data) {
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify(data),
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

function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '');
}

function getAssemblyScheduledStartMs(assembly) {
  if (!assembly) return null;
  const date = String(assembly.date || '').slice(0, 10);
  const time = String(assembly.start_time || '00:00').slice(0, 5);
  if (!date) return null;

  // Os horários cadastrados pela Condomit são horários locais do condomínio no Brasil.
  const parsed = new Date(`${date}T${time}:00-03:00`);
  const ms = parsed.getTime();
  return Number.isNaN(ms) ? null : ms;
}

async function logEvent(assemblyId, cep, eventType, payload, createdBy) {
  try {
    await supabase.from('assembly_event_logs').insert({
      assembly_id: assemblyId,
      cep,
      event_type: eventType,
      event_payload: payload || {},
      created_by: createdBy || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Falha ao registrar evento:', eventType, e.message);
  }
}

async function validateAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: httpError(401, 'Autenticação necessária. Forneça um token Bearer.') };
  }
  const token = authHeader.substring(7);

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData || !authData.user) {
    return { error: httpError(401, 'Token de autenticação inválido ou expirado.') };
  }
  const supabaseUser = authData.user;
  const userEmail = supabaseUser.email;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('name, email, user_type, cpf, phone, condominium')
    .eq('email', userEmail)
    .single();

  if (userError || !user) {
    return { error: httpError(401, 'Usuário não encontrado no sistema.') };
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
    return { error: httpError(403, 'Usuário não possui condomínio associado.') };
  }

  return { user, userEmail, userCEP };
}

async function fetchAssembly(assemblyId) {
  const { data: assembly, error: assemblyError } = await supabase
    .from('scheduled_assemblies')
    .select(`
      id, public_id, cep, title, description, date, start_time, end_time,
      status, created_by, assembly_type, expected_duration_minutes,
      livekit_room_name, started_at, ended_at
    `)
    .eq('id', assemblyId)
    .single();

  if (assemblyError || !assembly) {
    return { error: httpError(404, 'Assembleia não encontrada.') };
  }
  return { assembly };
}

function checkAssemblyOwnershipAndPermission(assembly, userCEP, user, userEmail) {
  if (normalizeCep(assembly.cep) !== normalizeCep(userCEP)) {
    return httpError(403, 'Esta assembleia pertence a outro condomínio.');
  }

  const isOrganizer = assembly.created_by === userEmail;
  const isSindico = user.user_type === 'sindico';

  if (!isOrganizer && !isSindico) {
    return httpError(403, 'Apenas o organizador ou síndico podem realizar esta ação.');
  }

  return null;
}

async function handleStart(assembly, userEmail, userCEP) {
  if (assembly.status === ASSEMBLY_STATUS.IN_PROGRESS) {
    return httpError(409, 'Assembleia já está em andamento.');
  }
  if (assembly.status === ASSEMBLY_STATUS.ENDED) {
    return httpError(409, 'Assembleia já foi encerrada e não pode ser reiniciada.');
  }
  if (assembly.status === ASSEMBLY_STATUS.CANCELED) {
    return httpError(409, 'Assembleia foi cancelada e não pode ser iniciada.');
  }
  if (assembly.status !== ASSEMBLY_STATUS.SCHEDULED) {
    return httpError(409, `Status atual (${assembly.status}) não permite iniciar a assembleia.`);
  }

  const scheduledStartMs = getAssemblyScheduledStartMs(assembly);
  if (scheduledStartMs && Date.now() < scheduledStartMs) {
    const scheduledStart = new Date(scheduledStartMs);
    return httpError(
      409,
      'A assembleia só pode ser iniciada a partir do horário cadastrado.',
      {
        scheduled_start: scheduledStart.toISOString(),
        date: assembly.date,
        start_time: assembly.start_time,
      }
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('scheduled_assemblies')
    .update({
      status: ASSEMBLY_STATUS.IN_PROGRESS,
      started_at: now,
      updated_at: now,
    })
    .eq('id', assembly.id);

  if (updateError) {
    return httpError(500, 'Erro ao iniciar assembleia.', updateError.message);
  }

  await logEvent(assembly.id, userCEP, 'assembly_started', {
    previous_status: assembly.status,
    new_status: ASSEMBLY_STATUS.IN_PROGRESS,
    started_at: now,
  }, userEmail);

  return successResponse({
    action: 'start',
    assembly_id: assembly.id,
    previous_status: assembly.status,
    new_status: ASSEMBLY_STATUS.IN_PROGRESS,
    started_at: now,
  });
}

async function handleEnd(assembly, userEmail, userCEP) {
  if (assembly.status === ASSEMBLY_STATUS.ENDED) {
    return httpError(409, 'Assembleia já foi encerrada.');
  }
  if (assembly.status === ASSEMBLY_STATUS.CANCELED) {
    return httpError(409, 'Assembleia foi cancelada, não pode ser encerrada.');
  }
  if (assembly.status === ASSEMBLY_STATUS.SCHEDULED) {
    return httpError(409, 'Assembleia ainda não foi iniciada. Inicie-a antes de encerrar.');
  }
  if (assembly.status !== ASSEMBLY_STATUS.IN_PROGRESS) {
    return httpError(409, `Status atual (${assembly.status}) não permite encerrar a assembleia.`);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('scheduled_assemblies')
    .update({
      status: ASSEMBLY_STATUS.ENDED,
      ended_at: now,
      updated_at: now,
    })
    .eq('id', assembly.id);

  if (updateError) {
    return httpError(500, 'Erro ao encerrar assembleia.', updateError.message);
  }

  await logEvent(assembly.id, userCEP, 'assembly_ended', {
    previous_status: assembly.status,
    new_status: ASSEMBLY_STATUS.ENDED,
    ended_at: now,
  }, userEmail);

  return successResponse({
    action: 'end',
    assembly_id: assembly.id,
    previous_status: assembly.status,
    new_status: ASSEMBLY_STATUS.ENDED,
    ended_at: now,
  });
}

async function handleCancel(assembly, userEmail, userCEP, reason) {
  if (assembly.status === ASSEMBLY_STATUS.ENDED) {
    return httpError(409, 'Assembleia já foi encerrada e não pode ser cancelada.');
  }
  if (assembly.status === ASSEMBLY_STATUS.CANCELED) {
    return httpError(409, 'Assembleia já foi cancelada.');
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('scheduled_assemblies')
    .update({
      status: ASSEMBLY_STATUS.CANCELED,
      ended_at: now,
      updated_at: now,
    })
    .eq('id', assembly.id);

  if (updateError) {
    return httpError(500, 'Erro ao cancelar assembleia.', updateError.message);
  }

  await logEvent(assembly.id, userCEP, 'assembly_canceled', {
    previous_status: assembly.status,
    new_status: ASSEMBLY_STATUS.CANCELED,
    canceled_at: now,
    reason: reason || null,
  }, userEmail);

  return successResponse({
    action: 'cancel',
    assembly_id: assembly.id,
    previous_status: assembly.status,
    new_status: ASSEMBLY_STATUS.CANCELED,
    canceled_at: now,
  });
}

async function handleStartPoll(assembly, userEmail, userCEP, pollId) {
  if (!pollId) {
    return httpError(400, 'ID da votação (poll_id) é obrigatório para ação start_poll.');
  }

  if (assembly.status !== ASSEMBLY_STATUS.IN_PROGRESS) {
    return httpError(409, `Só é possível abrir votações com a assembleia em andamento. Status atual: ${assembly.status}`);
  }

  const pollIdNum = parseInt(pollId, 10);
  if (isNaN(pollIdNum)) {
    return httpError(400, 'ID da votação inválido.');
  }

  const { data: poll, error: pollError } = await supabase
    .from('assembly_polls')
    .select('id, assembly_id, cep, title, status, created_by, start_at, end_at')
    .eq('id', pollIdNum)
    .single();

  if (pollError || !poll) {
    return httpError(404, 'Votação não encontrada.');
  }

  if (poll.assembly_id !== assembly.id) {
    return httpError(403, 'Esta votação não pertence a esta assembleia.');
  }

  if (poll.cep !== userCEP) {
    return httpError(403, 'Esta votação pertence a outro condomínio.');
  }

  if (poll.status === POLL_STATUS.OPEN) {
    return httpError(409, 'Esta votação já está aberta.');
  }
  if (poll.status === POLL_STATUS.CLOSED) {
    return httpError(409, 'Esta votação já foi encerrada e não pode ser reaberta.');
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('assembly_polls')
    .update({
      status: POLL_STATUS.OPEN,
      start_at: now,
      updated_at: now,
    })
    .eq('id', poll.id);

  if (updateError) {
    return httpError(500, 'Erro ao abrir votação.', updateError.message);
  }

  await logEvent(assembly.id, userCEP, 'poll_started', {
    poll_id: poll.id,
    poll_title: poll.title,
    previous_status: poll.status,
    new_status: POLL_STATUS.OPEN,
    started_at: now,
  }, userEmail);

  return successResponse({
    action: 'start_poll',
    assembly_id: assembly.id,
    poll_id: poll.id,
    poll_title: poll.title,
    previous_status: poll.status,
    new_status: POLL_STATUS.OPEN,
    started_at: now,
  });
}

async function handleEndPoll(assembly, userEmail, userCEP, pollId) {
  if (!pollId) {
    return httpError(400, 'ID da votação (poll_id) é obrigatório para ação end_poll.');
  }

  const pollIdNum = parseInt(pollId, 10);
  if (isNaN(pollIdNum)) {
    return httpError(400, 'ID da votação inválido.');
  }

  const { data: poll, error: pollError } = await supabase
    .from('assembly_polls')
    .select('id, assembly_id, cep, title, status, created_by, start_at, end_at')
    .eq('id', pollIdNum)
    .single();

  if (pollError || !poll) {
    return httpError(404, 'Votação não encontrada.');
  }

  if (poll.assembly_id !== assembly.id) {
    return httpError(403, 'Esta votação não pertence a esta assembleia.');
  }

  if (poll.cep !== userCEP) {
    return httpError(403, 'Esta votação pertence a outro condomínio.');
  }

  if (poll.status === POLL_STATUS.CLOSED) {
    return httpError(409, 'Esta votação já foi encerrada.');
  }
  if (poll.status !== POLL_STATUS.OPEN) {
    return httpError(409, `Só é possível encerrar votações abertas. Status atual: ${poll.status}`);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('assembly_polls')
    .update({
      status: POLL_STATUS.CLOSED,
      end_at: now,
      updated_at: now,
    })
    .eq('id', poll.id);

  if (updateError) {
    return httpError(500, 'Erro ao encerrar votação.', updateError.message);
  }

  await logEvent(assembly.id, userCEP, 'poll_ended', {
    poll_id: poll.id,
    poll_title: poll.title,
    previous_status: poll.status,
    new_status: POLL_STATUS.CLOSED,
    ended_at: now,
  }, userEmail);

  return successResponse({
    action: 'end_poll',
    assembly_id: assembly.id,
    poll_id: poll.id,
    poll_title: poll.title,
    previous_status: poll.status,
    new_status: POLL_STATUS.CLOSED,
    ended_at: now,
  });
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return httpError(405, 'Método não permitido. Use POST.');
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return httpError(500, 'Servidor não configurado corretamente. Contate o administrador.');
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return httpError(400, 'Corpo da requisição inválido. JSON esperado.');
  }

  const { action, assembly_id, poll_id, reason } = body;

  if (!action) {
    return httpError(400, 'Ação (action) é obrigatória.');
  }
  if (!VALID_ACTIONS.includes(action)) {
    return httpError(400, `Ação inválida. Ações permitidas: ${VALID_ACTIONS.join(', ')}.`);
  }
  if (!assembly_id) {
    return httpError(400, 'ID da assembleia (assembly_id) é obrigatório.');
  }

  const assemblyIdNum = parseInt(assembly_id, 10);
  if (isNaN(assemblyIdNum)) {
    return httpError(400, 'ID da assembleia inválido.');
  }

  const authResult = await validateAuth(event);
  if (authResult.error) return authResult.error;
  const { user, userEmail, userCEP } = authResult;

  const assemblyResult = await fetchAssembly(assemblyIdNum);
  if (assemblyResult.error) return assemblyResult.error;
  const { assembly } = assemblyResult;

  const permissionError = checkAssemblyOwnershipAndPermission(assembly, userCEP, user, userEmail);
  if (permissionError) return permissionError;

  switch (action) {
    case 'start':
      return await handleStart(assembly, userEmail, userCEP);
    case 'end':
      return await handleEnd(assembly, userEmail, userCEP);
    case 'cancel':
      return await handleCancel(assembly, userEmail, userCEP, reason);
    case 'start_poll':
      return await handleStartPoll(assembly, userEmail, userCEP, poll_id);
    case 'end_poll':
      return await handleEndPoll(assembly, userEmail, userCEP, poll_id);
    default:
      return httpError(400, `Ação "${action}" não implementada.`);
  }
};

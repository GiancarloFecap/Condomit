const {
  supabase,
  corsHeaders,
  httpError,
  normalizeCep,
  getAuthenticatedContext,
  belongsToCep,
  isAllowedAssemblyRoomStatus
} = require('./lib/assembly-context');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return httpError(405, 'Método não permitido. Use POST.');
  }

  let body = {};

  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (_) {
    return httpError(400, 'Corpo da requisição inválido.');
  }

  const pollId = Number.parseInt(String(body.poll_id || body.pollId || ''), 10);
  const optionId = Number.parseInt(String(body.option_id || body.optionId || ''), 10);
  const assemblyId = Number.parseInt(String(body.assembly_id || body.assemblyId || ''), 10);

  if (
    !Number.isInteger(pollId) || pollId <= 0 ||
    !Number.isInteger(optionId) || optionId <= 0 ||
    !Number.isInteger(assemblyId) || assemblyId <= 0
  ) {
    return httpError(400, 'Parâmetros obrigatórios ausentes ou inválidos.');
  }

  const context = await getAuthenticatedContext(event);
  if (context.error) return context.error;

  if (String(context.user.user_type || '').toLowerCase() === 'porteiro') {
    return httpError(403, 'Porteiros não podem votar.');
  }

  const {
    data: assembly,
    error: assemblyError
  } = await supabase
    .from('scheduled_assemblies')
    .select('id,cep,status,created_by')
    .eq('id', assemblyId)
    .maybeSingle();

  if (assemblyError || !assembly) {
    return httpError(
      404,
      'Assembleia não encontrada.',
      assemblyError?.message || null
    );
  }

  if (!belongsToCep(context, assembly.cep)) {
    return httpError(403, 'Esta assembleia pertence a outro condomínio.');
  }

  if (!isAllowedAssemblyRoomStatus(assembly.status)) {
    return httpError(409, 'Assembleia indisponível para votação.');
  }

  const {
    data: poll,
    error: pollError
  } = await supabase
    .from('assembly_polls')
    .select('id,assembly_id,cep,status,start_at,end_at')
    .eq('id', pollId)
    .maybeSingle();

  if (pollError || !poll) {
    return httpError(
      404,
      'Votação não encontrada.',
      pollError?.message || null
    );
  }

  if (Number(poll.assembly_id) !== Number(assembly.id)) {
    return httpError(403, 'Votação não pertence à assembleia.');
  }

  if (normalizeCep(poll.cep) !== normalizeCep(assembly.cep)) {
    return httpError(403, 'Votação pertence a outro condomínio.');
  }

  if (String(poll.status || '').toLowerCase() !== 'aberta') {
    return httpError(409, 'Votação encerrada ou não iniciada.');
  }

  const nowMs = Date.now();

  if (poll.start_at) {
    const startMs = new Date(poll.start_at).getTime();
    if (!Number.isNaN(startMs) && nowMs < startMs) {
      return httpError(409, 'Votação ainda não iniciada.');
    }
  }

  if (poll.end_at) {
    const endMs = new Date(poll.end_at).getTime();
    if (!Number.isNaN(endMs) && nowMs >= endMs) {
      return httpError(409, 'Votação encerrada.');
    }
  }

  const {
    data: option,
    error: optionError
  } = await supabase
    .from('assembly_poll_options')
    .select('id,poll_id')
    .eq('id', optionId)
    .maybeSingle();

  if (optionError || !option) {
    return httpError(404, 'Opção inválida.', optionError?.message || null);
  }

  if (Number(option.poll_id) !== Number(poll.id)) {
    return httpError(400, 'Opção não pertence à votação.');
  }

  const {
    data: existingVote,
    error: existingVoteError
  } = await supabase
    .from('assembly_votes')
    .select('id')
    .eq('poll_id', poll.id)
    .eq('user_email', context.userEmail)
    .limit(1)
    .maybeSingle();

  if (!existingVoteError && existingVote) {
    return httpError(409, 'Você já votou nesta votação.');
  }

  const now = new Date().toISOString();

  const {
    data: inserted,
    error: insertError
  } = await supabase
    .from('assembly_votes')
    .insert({
      poll_id: poll.id,
      option_id: option.id,
      assembly_id: assembly.id,
      cep: assembly.cep,
      user_email: context.userEmail,
      created_at: now
    })
    .select('*')
    .single();

  if (insertError) {
    const msg = String(insertError.message || '').toLowerCase();

    if (msg.includes('duplicate') || msg.includes('unique')) {
      return httpError(409, 'Você já votou nesta votação.');
    }

    console.error('[vote-poll] Falha no INSERT:', insertError);

    return httpError(
      500,
      `Erro ao registrar voto: ${insertError.message}`,
      insertError.details || insertError.hint || null
    );
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify(inserted)
  };
};

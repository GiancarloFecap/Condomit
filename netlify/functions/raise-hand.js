const {
  supabase,
  corsHeaders,
  httpError,
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

  const assemblyId = Number.parseInt(
    String(body.assembly_id || body.assemblyId || ''),
    10
  );

  if (!Number.isInteger(assemblyId) || assemblyId <= 0) {
    return httpError(400, 'ID da assembleia é obrigatório.');
  }

  const context = await getAuthenticatedContext(event);
  if (context.error) return context.error;

  if (String(context.user.user_type || '').toLowerCase() === 'porteiro') {
    return httpError(403, 'Porteiros não podem participar da assembleia.');
  }

  const {
    data: assembly,
    error: assemblyError
  } = await supabase
    .from('scheduled_assemblies')
    .select('id,cep,status')
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

  /*
   * A sala já permite entrada enquanto a assembleia está "agendada".
   * Portanto a mão também precisa funcionar em "agendada" e
   * "em_andamento".
   */
  if (!isAllowedAssemblyRoomStatus(assembly.status)) {
    return httpError(
      409,
      'A mão levantada não está disponível para esta assembleia.'
    );
  }

  const {
    data: latestRows,
    error: latestError
  } = await supabase
    .from('assembly_speaking_requests')
    .select('id,status')
    .eq('assembly_id', assembly.id)
    .eq('user_email', context.userEmail)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (latestError) {
    return httpError(
      500,
      'Erro ao consultar a mão levantada.',
      latestError.message
    );
  }

  const latest = Array.isArray(latestRows) && latestRows.length
    ? latestRows[0]
    : null;

  const currentStatus = String(latest?.status || '').toLowerCase();
  const nextStatus = currentStatus === 'raised' ? 'lowered' : 'raised';
  const now = new Date().toISOString();

  const payload = {
    assembly_id: assembly.id,
    cep: assembly.cep,
    user_email: context.userEmail,
    participant_name: context.user.name || context.userEmail,
    participant_role: context.user.user_type || 'morador',
    identity: `user-${context.authUser.id}-assembly-${assembly.id}`,
    status: nextStatus,
    requested_at: now,
    created_at: now
  };

  const {
    data: inserted,
    error: insertError
  } = await supabase
    .from('assembly_speaking_requests')
    .insert(payload)
    .select('*')
    .single();

  if (insertError) {
    console.error('[raise-hand] Falha no INSERT:', insertError);

    return httpError(
      500,
      `Erro ao registrar solicitação: ${insertError.message}`,
      insertError.details || insertError.hint || null
    );
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify(inserted)
  };
};

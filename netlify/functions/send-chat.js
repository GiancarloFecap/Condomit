const {
  supabase,
  corsHeaders,
  httpError,
  getAuthenticatedContext,
  belongsToCep,
  isAllowedAssemblyRoomStatus
} = require('./lib/assembly-context');

function sanitizeMessage(message) {
  const raw = String(message ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return '';

  return raw
    .replace(/[<>]/g, '')
    .slice(0, 800);
}

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

  const message = sanitizeMessage(body.message);

  if (!Number.isInteger(assemblyId) || assemblyId <= 0) {
    return httpError(400, 'ID da assembleia é obrigatório.');
  }

  if (!message) {
    return httpError(400, 'Mensagem vazia.');
  }

  const context = await getAuthenticatedContext(event);
  if (context.error) return context.error;

  if (String(context.user.user_type || '').toLowerCase() === 'porteiro') {
    return httpError(403, 'Porteiros não podem participar do chat.');
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

  if (!isAllowedAssemblyRoomStatus(assembly.status)) {
    return httpError(409, 'Chat indisponível para esta assembleia.');
  }

  const now = new Date().toISOString();

  const payload = {
    assembly_id: assembly.id,
    cep: assembly.cep,
    user_email: context.userEmail,
    participant_name: context.user.name || context.userEmail,
    participant_role: context.user.user_type || 'morador',
    message,
    created_at: now
  };

  const {
    data: inserted,
    error: insertError
  } = await supabase
    .from('assembly_chat_messages')
    .insert(payload)
    .select('*')
    .single();

  if (insertError) {
    console.error('[send-chat] Falha no INSERT:', insertError);

    return httpError(
      500,
      `Erro ao salvar mensagem: ${insertError.message}`,
      insertError.details || insertError.hint || null
    );
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify(inserted)
  };
};

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function httpError(statusCode, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body)
  };
}

function validateServerConfig() {
  if (!SUPABASE_URL) {
    return 'SUPABASE_URL não configurada no Netlify.';
  }

  if (!SUPABASE_SERVICE_ROLE) {
    return 'SUPABASE_SERVICE_ROLE_KEY não configurada no Netlify.';
  }

  if (String(SUPABASE_SERVICE_ROLE).startsWith('sb_publishable_')) {
    return 'SUPABASE_SERVICE_ROLE_KEY está usando uma Publishable key. No backend use a chave de servidor/service role.';
  }

  return null;
}

function getSupabaseAdmin() {
  const configError = validateServerConfig();
  if (configError) throw new Error(configError);

  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

function normalizeCep(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : '';
}

function parsePossibleJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function collectUserCondoDigits(user, links) {
  const values = [];

  (Array.isArray(links) ? links : []).forEach((row) => {
    values.push(row?.condominium_id);
  });

  values.push(
    user?.cep,
    user?.condominium_cep,
    user?.condominium_id,
    user?.condominiumId
  );

  const condominium = parsePossibleJson(user?.condominium);

  if (condominium) {
    values.push(
      condominium.cep,
      condominium.condominium_cep,
      condominium.condominium_id,
      condominium.condominiumId,
      condominium.id
    );
  }

  return new Set(
    values
      .map(normalizeCep)
      .filter(Boolean)
  );
}

async function validateAuth(event, supabase) {
  const authHeader =
    event.headers.authorization ||
    event.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: httpError(401, 'Autenticação necessária.')
    };
  }

  const token = authHeader.substring(7).trim();

  const {
    data: authData,
    error: authError
  } = await supabase.auth.getUser(token);

  if (authError || !authData?.user?.email) {
    return {
      error: httpError(
        401,
        'Token de autenticação inválido ou expirado.',
        authError?.message || null
      )
    };
  }

  const authUser = authData.user;
  const userEmail = String(authUser.email || '')
    .trim()
    .toLowerCase();

  const {
    data: user,
    error: userError
  } = await supabase
    .from('users')
    .select('name,email,user_type,condominium')
    .eq('email', userEmail)
    .maybeSingle();

  if (userError || !user) {
    return {
      error: httpError(
        401,
        'Usuário não encontrado no sistema.',
        userError?.message || null
      )
    };
  }

  const {
    data: links,
    error: linksError
  } = await supabase
    .from('user_condominiums')
    .select('condominium_id')
    .eq('user_email', userEmail);

  if (linksError) {
    console.warn(
      '[raise-hand] Falha ao consultar user_condominiums:',
      linksError.message
    );
  }

  return {
    authUser,
    user,
    userEmail,
    condominiumDigits: collectUserCondoDigits(user, links)
  };
}

function isAllowedAssemblyStatus(status) {
  return ['agendada', 'em_andamento'].includes(
    String(status || '').trim().toLowerCase()
  );
}

async function insertSpeakingRequest(supabase, payload) {
  let result = await supabase
    .from('assembly_speaking_requests')
    .insert(payload)
    .select('*')
    .single();

  if (!result.error) return result;

  const firstMessage = String(result.error.message || '');

  // Compatibilidade com tabelas sem identity.
  if (/identity/i.test(firstMessage)) {
    const retryPayload = { ...payload };
    delete retryPayload.identity;

    result = await supabase
      .from('assembly_speaking_requests')
      .insert(retryPayload)
      .select('*')
      .single();
  }

  if (!result.error) return result;

  const secondMessage = String(result.error.message || '');

  // Compatibilidade com tabelas sem participant_role.
  if (/participant_role/i.test(secondMessage)) {
    const retryPayload = { ...payload };
    delete retryPayload.identity;
    delete retryPayload.participant_role;

    result = await supabase
      .from('assembly_speaking_requests')
      .insert(retryPayload)
      .select('*')
      .single();
  }

  return result;
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

  let supabase;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return httpError(500, 'Configuração do Supabase no backend inválida.', error.message);
  }

  let body;

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

  const auth = await validateAuth(event, supabase);
  if (auth.error) return auth.error;

  if (
    String(auth.user.user_type || '').trim().toLowerCase() === 'porteiro'
  ) {
    return httpError(403, 'Porteiros não podem participar.');
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

  const assemblyCepDigits = normalizeCep(assembly.cep);
  let belongsToAssemblyCondominium = Boolean(
    assemblyCepDigits && auth.condominiumDigits.has(assemblyCepDigits)
  );

  /*
   * v0.64.0: quem já foi admitido/autenticado na própria assembleia não deve
   * receber um falso "outro condomínio" por causa de vínculo/CEP legado.
   * A presença é criada apenas pelo fluxo autenticado da sala, portanto serve
   * como fallback seguro sem liberar a assembleia para usuários aleatórios.
   */
  if (!belongsToAssemblyCondominium) {
    const { data: attendance, error: attendanceError } = await supabase
      .from('assembly_attendance')
      .select('assembly_id,user_email,cep,presence_status,last_heartbeat_at')
      .eq('assembly_id', assembly.id)
      .eq('user_email', auth.userEmail)
      .maybeSingle();

    if (attendanceError) {
      console.warn('[raise-hand] Falha ao validar presença como fallback:', attendanceError.message);
    }

    belongsToAssemblyCondominium = Boolean(
      attendance &&
      Number(attendance.assembly_id) === Number(assembly.id) &&
      String(attendance.user_email || '').trim().toLowerCase() === auth.userEmail &&
      (!normalizeCep(attendance.cep) || normalizeCep(attendance.cep) === assemblyCepDigits)
    );
  }

  if (!assemblyCepDigits || !belongsToAssemblyCondominium) {
    return httpError(
      403,
      auth.condominiumDigits.size
        ? 'Esta assembleia pertence a outro condomínio.'
        : 'Usuário não possui condomínio associado.'
    );
  }

  /*
   * A sala já pode estar aberta enquanto o registro ainda está "agendada".
   * Por isso a mão fica disponível nos dois estados.
   */
  if (!isAllowedAssemblyStatus(assembly.status)) {
    return httpError(
      409,
      'A mão levantada não está disponível para o status atual da assembleia.'
    );
  }

  const {
    data: latest,
    error: latestError
  } = await supabase
    .from('assembly_speaking_requests')
    .select('id,status')
    .eq('assembly_id', assembly.id)
    .eq('user_email', auth.userEmail)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (latestError) {
    return httpError(
      500,
      `Erro ao consultar mão levantada: ${latestError.message}`
    );
  }

  const latestRow =
    Array.isArray(latest) && latest.length
      ? latest[0]
      : null;

  const currentStatus = String(
    latestRow?.status || ''
  ).trim().toLowerCase();

  const activeStatuses = new Set([
    'aguardando',
    'autorizado',
    // Compatibilidade temporária com registros criados por versões antigas.
    'raised'
  ]);

  const now = new Date().toISOString();

  /*
   * A tabela original do Condomit usa os estados:
   * aguardando | autorizado | recusado | finalizado
   *
   * Portanto:
   * - levantar mão  => INSERT com status "aguardando"
   * - abaixar mão   => UPDATE da solicitação ativa para "finalizado"
   */
  if (latestRow && activeStatuses.has(currentStatus)) {
    let updateResult = await supabase
      .from('assembly_speaking_requests')
      .update({
        status: 'finalizado',
        answered_at: now,
        updated_at: now
      })
      .eq('id', latestRow.id)
      .select('*')
      .single();

    // Compatibilidade com a versão original da tabela, que não tinha updated_at.
    if (
      updateResult.error &&
      /updated_at/i.test(String(updateResult.error.message || ''))
    ) {
      updateResult = await supabase
        .from('assembly_speaking_requests')
        .update({
          status: 'finalizado',
          answered_at: now
        })
        .eq('id', latestRow.id)
        .select('*')
        .single();
    }

    if (updateResult.error) {
      console.error('[raise-hand] UPDATE falhou:', updateResult.error);

      return httpError(
        500,
        `Erro ao abaixar a mão: ${updateResult.error.message || 'erro desconhecido no banco.'}`,
        {
          code: updateResult.error.code || null,
          details: updateResult.error.details || null,
          hint: updateResult.error.hint || null
        }
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        ...updateResult.data,
        raised: false
      })
    };
  }

  const payload = {
    assembly_id: assembly.id,
    cep: assembly.cep,
    user_email: auth.userEmail,
    participant_name: auth.user.name || auth.userEmail,
    participant_role: auth.user.user_type || 'morador',
    identity: `user-${auth.authUser.id}-assembly-${assembly.id}`,
    status: 'aguardando',
    requested_at: now
  };

  const {
    data: inserted,
    error: insertError
  } = await insertSpeakingRequest(supabase, payload);

  if (insertError) {
    console.error('[raise-hand] INSERT falhou:', insertError);

    if (String(insertError.code || '') === '23505') {
      return httpError(
        409,
        'Sua mão já está levantada.'
      );
    }

    return httpError(
      500,
      `Erro ao registrar solicitação: ${insertError.message || 'erro desconhecido no banco.'}`,
      {
        code: insertError.code || null,
        details: insertError.details || null,
        hint: insertError.hint || null
      }
    );
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      ...inserted,
      raised: true
    })
  };
};

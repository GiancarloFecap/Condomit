const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',
    'Access-Control-Allow-Methods':
      'POST, OPTIONS'
  };
}

function httpError(
  statusCode,
  message,
  details = null
) {
  const body = {
    error: message
  };

  if (details) {
    body.details = details;
  }

  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body)
  };
}

function normalizeCep(value) {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  return digits.length === 8
    ? digits
    : '';
}

function formatCep(value) {
  const digits =
    normalizeCep(value);

  return digits
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : '';
}

function parsePossibleJson(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
    'object'
  ) {
    return value;
  }

  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function getUserCepFromProfile(user) {
  if (!user) {
    return '';
  }

  const direct =
    user.cep ||
    user.condominium_cep ||
    user.condominiumCep ||
    user.condominium_id ||
    user.condominiumId;

  if (
    normalizeCep(direct)
  ) {
    return formatCep(direct);
  }

  const condominium =
    parsePossibleJson(
      user.condominium
    );

  if (!condominium) {
    return '';
  }

  const nested =
    condominium.cep ||
    condominium.condominium_cep ||
    condominium.condominiumCep ||
    condominium.condominium_id ||
    condominium.condominiumId ||
    condominium.id;

  return formatCep(nested);
}

function sanitizeMessage(message) {
  const raw =
    String(message ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  if (!raw) {
    return '';
  }

  return raw
    .replace(/[<>]/g, '')
    .slice(0, 800);
}

async function validateAuth(event) {
  const authHeader =
    event.headers.authorization ||
    event.headers.Authorization;

  if (
    !authHeader ||
    !authHeader.startsWith(
      'Bearer '
    )
  ) {
    return {
      error:
        httpError(
          401,
          'Autenticação necessária.'
        )
    };
  }

  const token =
    authHeader
      .substring(7)
      .trim();

  const {
    data: authData,
    error: authError
  } =
    await supabase.auth
      .getUser(token);

  if (
    authError ||
    !authData?.user?.email
  ) {
    return {
      error:
        httpError(
          401,
          'Token de autenticação inválido ou expirado.'
        )
    };
  }

  const authUser =
    authData.user;

  const userEmail =
    String(
      authUser.email || ''
    )
      .trim()
      .toLowerCase();

  const {
    data: user,
    error: userError
  } =
    await supabase
      .from('users')
      .select(
        'name, email, user_type, condominium'
      )
      .eq(
        'email',
        userEmail
      )
      .maybeSingle();

  if (
    userError ||
    !user
  ) {
    return {
      error:
        httpError(
          401,
          'Usuário não encontrado no sistema.'
        )
    };
  }

  /*
   * Procura TODAS as associações
   * existentes em user_condominiums.
   */
  const {
    data: links,
    error: linksError
  } =
    await supabase
      .from(
        'user_condominiums'
      )
      .select(
        'condominium_id'
      )
      .eq(
        'user_email',
        userEmail
      );

  if (linksError) {
    console.warn(
      '[send-chat] Não foi possível consultar user_condominiums:',
      linksError.message
    );
  }

  const condoDigits =
    new Set();

  (
    Array.isArray(links)
      ? links
      : []
  ).forEach(
    (row) => {
      const digits =
        normalizeCep(
          row?.condominium_id
        );

      if (digits) {
        condoDigits.add(
          digits
        );
      }
    }
  );

  /*
   * Fallback importante:
   * síndicos e alguns usuários
   * podem ter o condomínio apenas
   * em users.condominium.
   */
  const profileCep =
    getUserCepFromProfile(
      user
    );

  const profileDigits =
    normalizeCep(
      profileCep
    );

  if (profileDigits) {
    condoDigits.add(
      profileDigits
    );
  }

  return {
    user,
    authUser,
    userEmail,
    condominiumDigits:
      condoDigits
  };
}

function userBelongsToAssembly(
  auth,
  assemblyCep
) {
  const assemblyDigits =
    normalizeCep(
      assemblyCep
    );

  return Boolean(
    assemblyDigits &&
    auth
      ?.condominiumDigits
      ?.has(
        assemblyDigits
      )
  );
}

exports.handler =
  async (event) => {
    if (
      event.httpMethod ===
      'OPTIONS'
    ) {
      return {
        statusCode: 204,
        headers:
          corsHeaders(),
        body: ''
      };
    }

    if (
      event.httpMethod !==
      'POST'
    ) {
      return httpError(
        405,
        'Método não permitido. Use POST.'
      );
    }

    let body;

    try {
      body =
        event.body
          ? JSON.parse(
              event.body
            )
          : {};
    } catch (_) {
      return httpError(
        400,
        'Corpo da requisição inválido.'
      );
    }

    const assemblyId =
      Number.parseInt(
        String(
          body.assembly_id ||
          body.assemblyId ||
          ''
        ),
        10
      );

    const message =
      sanitizeMessage(
        body.message
      );

    if (
      !Number.isInteger(
        assemblyId
      ) ||
      assemblyId <= 0
    ) {
      return httpError(
        400,
        'ID da assembleia é obrigatório.'
      );
    }

    if (!message) {
      return httpError(
        400,
        'Mensagem vazia.'
      );
    }

    const auth =
      await validateAuth(
        event
      );

    if (auth.error) {
      return auth.error;
    }

    if (
      String(
        auth.user
          .user_type ||
        ''
      )
        .toLowerCase() ===
      'porteiro'
    ) {
      return httpError(
        403,
        'Porteiros não podem participar do chat.'
      );
    }

    const {
      data: assembly,
      error: assemblyError
    } =
      await supabase
        .from(
          'scheduled_assemblies'
        )
        .select(
          'id, cep, status'
        )
        .eq(
          'id',
          assemblyId
        )
        .maybeSingle();

    if (
      assemblyError ||
      !assembly
    ) {
      return httpError(
        404,
        'Assembleia não encontrada.'
      );
    }

    if (
      !auth
        .condominiumDigits
        .size
    ) {
      return httpError(
        403,
        'Usuário não possui condomínio associado.'
      );
    }

    if (
      !userBelongsToAssembly(
        auth,
        assembly.cep
      )
    ) {
      return httpError(
        403,
        'Esta assembleia pertence a outro condomínio.'
      );
    }

    const status =
      String(
        assembly.status ||
        ''
      ).toLowerCase();

    if (
      ![
        'agendada',
        'em_andamento'
      ].includes(status)
    ) {
      return httpError(
        409,
        'Chat indisponível para esta assembleia.'
      );
    }

    /*
     * Usa o CEP da própria assembleia
     * como fonte de verdade.
     */
    const {
      data: inserted,
      error: insertError
    } =
      await supabase
        .from(
          'assembly_chat_messages'
        )
        .insert({
          assembly_id:
            assembly.id,

          cep:
            assembly.cep,

          user_email:
            auth.userEmail,

          participant_name:
            auth.user.name ||
            auth.userEmail,

          participant_role:
            auth.user.user_type,

          message,

          created_at:
            new Date()
              .toISOString()
        })
        .select('*')
        .single();

    if (insertError) {
      return httpError(
        500,
        'Erro ao salvar mensagem.',
        insertError.message
      );
    }

    return {
      statusCode: 200,
      headers:
        corsHeaders(),
      body:
        JSON.stringify(
          inserted
        )
    };
  };
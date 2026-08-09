const { createClient } =
  require(
    '@supabase/supabase-js'
  );

const SUPABASE_URL =
  process.env
    .VITE_SUPABASE_URL ||
  process.env
    .SUPABASE_URL;

const SUPABASE_SERVICE_ROLE =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE,
    {
      auth: {
        autoRefreshToken:
          false,

        persistSession:
          false
      }
    }
  );

function corsHeaders() {
  return {
    'Content-Type':
      'application/json',

    'Access-Control-Allow-Origin':
      '*',

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
    error:
      message
  };

  if (details) {
    body.details =
      details;
  }

  return {
    statusCode,

    headers:
      corsHeaders(),

    body:
      JSON.stringify(
        body
      )
  };
}

function normalizeCep(
  value
) {
  const digits =
    String(
      value || ''
    ).replace(
      /\D/g,
      ''
    );

  return (
    digits.length === 8
      ? digits
      : ''
  );
}

function formatCep(
  value
) {
  const digits =
    normalizeCep(
      value
    );

  return (
    digits
      ? `${digits.slice(
          0,
          5
        )}-${digits.slice(5)}`
      : ''
  );
}

function parsePossibleJson(
  value
) {
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
    return JSON.parse(
      value
    );
  } catch (_) {
    return null;
  }
}

function getUserCepFromProfile(
  user
) {
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
    normalizeCep(
      direct
    )
  ) {
    return formatCep(
      direct
    );
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
    condominium
      .condominium_cep ||
    condominium
      .condominiumCep ||
    condominium
      .condominium_id ||
    condominium
      .condominiumId ||
    condominium.id;

  return formatCep(
    nested
  );
}

async function validateAuth(
  event
) {
  const authHeader =
    event.headers
      .authorization ||
    event.headers
      .Authorization;

  if (
    !authHeader ||
    !authHeader
      .startsWith(
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
    data:
      authData,

    error:
      authError
  } =
    await supabase
      .auth
      .getUser(
        token
      );

  if (
    authError ||
    !authData
      ?.user
      ?.email
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
      authUser.email ||
      ''
    )
      .trim()
      .toLowerCase();

  const {
    data: user,
    error:
      userError
  } =
    await supabase
      .from(
        'users'
      )
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

  const {
    data: links,
    error:
      linksError
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
      '[raise-hand] Não foi possível consultar user_condominiums:',
      linksError.message
    );
  }

  const condoDigits =
    new Set();

  (
    Array.isArray(
      links
    )
      ? links
      : []
  ).forEach(
    (row) => {
      const digits =
        normalizeCep(
          row
            ?.condominium_id
        );

      if (digits) {
        condoDigits.add(
          digits
        );
      }
    }
  );

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
        statusCode:
          204,

        headers:
          corsHeaders(),

        body:
          ''
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
        'Porteiros não podem participar.'
      );
    }

    const {
      data: assembly,
      error:
        assemblyError
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

    if (
      String(
        assembly.status ||
        ''
      )
        .toLowerCase() !==
      'em_andamento'
    ) {
      return httpError(
        409,
        'A mão levantada só está disponível durante a assembleia.'
      );
    }

    const {
      data: latest,
      error:
        latestError
    } =
      await supabase
        .from(
          'assembly_speaking_requests'
        )
        .select(
          'id, status'
        )
        .eq(
          'assembly_id',
          assembly.id
        )
        .eq(
          'user_email',
          auth.userEmail
        )
        .order(
          'requested_at',
          {
            ascending:
              false
          }
        )
        .limit(1);

    if (latestError) {
      return httpError(
        500,
        'Erro ao consultar a mão levantada.',
        latestError.message
      );
    }

    const currentStatus =
      Array.isArray(
        latest
      ) &&
      latest.length
        ? String(
            latest[0]
              .status ||
            ''
          )
            .toLowerCase()
        : '';

    const nextStatus =
      currentStatus &&
      currentStatus !==
        'lowered'
        ? 'lowered'
        : 'raised';

    const now =
      new Date()
        .toISOString();

    /*
     * IMPORTANTE:
     *
     * Mesma identity usada em
     * livekit-token.js:
     *
     * user-UUID-assembly-ID
     */
    const identity =
      `user-${auth.authUser.id}-assembly-${assembly.id}`;

    const {
      data:
        inserted,

      error:
        insertError
    } =
      await supabase
        .from(
          'assembly_speaking_requests'
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

          identity,

          status:
            nextStatus,

          requested_at:
            now,

          created_at:
            now
        })
        .select('*')
        .single();

    if (insertError) {
      return httpError(
        500,
        'Erro ao registrar solicitação.',
        insertError.message
      );
    }

    return {
      statusCode:
        200,

      headers:
        corsHeaders(),

      body:
        JSON.stringify(
          inserted
        )
    };
  };
const { createClient } =
  require(
    '@supabase/supabase-js'
  );

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

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
    error: userError
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
      '[vote-poll] Não foi possível consultar user_condominiums:',
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

    const pollId =
      Number.parseInt(
        String(
          body.poll_id ||
          body.pollId ||
          ''
        ),
        10
      );

    const optionId =
      Number.parseInt(
        String(
          body.option_id ||
          body.optionId ||
          ''
        ),
        10
      );

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
        pollId
      ) ||
      pollId <= 0 ||

      !Number.isInteger(
        optionId
      ) ||
      optionId <= 0 ||

      !Number.isInteger(
        assemblyId
      ) ||
      assemblyId <= 0
    ) {
      return httpError(
        400,
        'Parâmetros obrigatórios ausentes.'
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
        'Porteiros não podem votar.'
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
          'id, cep, status, created_by'
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
        'Assembleia indisponível para votação.'
      );
    }

    const {
      data: poll,
      error:
        pollError
    } =
      await supabase
        .from(
          'assembly_polls'
        )
        .select(
          'id, assembly_id, cep, status, start_at, end_at'
        )
        .eq(
          'id',
          pollId
        )
        .maybeSingle();

    if (
      pollError ||
      !poll
    ) {
      return httpError(
        404,
        'Votação não encontrada.'
      );
    }

    if (
      Number(
        poll.assembly_id
      ) !==
      Number(
        assembly.id
      )
    ) {
      return httpError(
        403,
        'Votação não pertence à assembleia.'
      );
    }

    if (
      normalizeCep(
        poll.cep
      ) !==
      normalizeCep(
        assembly.cep
      )
    ) {
      return httpError(
        403,
        'Votação pertence a outro condomínio.'
      );
    }

    if (
      String(
        poll.status ||
        ''
      )
        .toLowerCase() !==
      'aberta'
    ) {
      return httpError(
        409,
        'Votação encerrada ou não iniciada.'
      );
    }

    const now =
      Date.now();

    if (
      poll.start_at
    ) {
      const start =
        new Date(
          poll.start_at
        ).getTime();

      if (
        !Number.isNaN(
          start
        ) &&
        now < start
      ) {
        return httpError(
          409,
          'Votação ainda não iniciada.'
        );
      }
    }

    if (
      poll.end_at
    ) {
      const end =
        new Date(
          poll.end_at
        ).getTime();

      if (
        !Number.isNaN(
          end
        ) &&
        now >= end
      ) {
        return httpError(
          409,
          'Votação encerrada.'
        );
      }
    }

    const {
      data: option,
      error:
        optionError
    } =
      await supabase
        .from(
          'assembly_poll_options'
        )
        .select(
          'id, poll_id'
        )
        .eq(
          'id',
          optionId
        )
        .maybeSingle();

    if (
      optionError ||
      !option
    ) {
      return httpError(
        404,
        'Opção inválida.'
      );
    }

    if (
      Number(
        option.poll_id
      ) !==
      Number(
        poll.id
      )
    ) {
      return httpError(
        400,
        'Opção não pertence à votação.'
      );
    }

    const {
      data:
        existingVote,

      error:
        existingVoteError
    } =
      await supabase
        .from(
          'assembly_votes'
        )
        .select(
          'id'
        )
        .eq(
          'poll_id',
          poll.id
        )
        .eq(
          'user_email',
          auth.userEmail
        )
        .limit(1)
        .maybeSingle();

    if (
      !existingVoteError &&
      existingVote
    ) {
      return httpError(
        409,
        'Você já votou nesta votação.'
      );
    }

    const {
      data:
        inserted,

      error:
        insertError
    } =
      await supabase
        .from(
          'assembly_votes'
        )
        .insert({
          poll_id:
            poll.id,

          option_id:
            option.id,

          assembly_id:
            assembly.id,

          cep:
            assembly.cep,

          user_email:
            auth.userEmail,

          created_at:
            new Date()
              .toISOString()
        })
        .select('*')
        .single();

    if (insertError) {
      const msg =
        String(
          insertError
            .message ||
          ''
        )
          .toLowerCase();

      if (
        msg.includes(
          'duplicate'
        ) ||
        msg.includes(
          'unique'
        )
      ) {
        return httpError(
          409,
          'Você já votou nesta votação.'
        );
      }

      return httpError(
        500,
        'Erro ao registrar voto.',
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
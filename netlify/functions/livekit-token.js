'use strict';

const { createClient } = require('@supabase/supabase-js');
const {
  AccessToken,
  TrackSource,
} = require('livekit-server-sdk');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
).trim();

const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

const LIVEKIT_API_KEY = String(
  process.env.LIVEKIT_API_KEY ||
  ''
).trim();

const LIVEKIT_API_SECRET = String(
  process.env.LIVEKIT_API_SECRET ||
  ''
).trim();

const LIVEKIT_URL = String(
  process.env.LIVEKIT_URL ||
  process.env.VITE_LIVEKIT_URL ||
  ''
).trim();

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let supabaseClient = null;

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabaseClient;
}

function httpResponse(statusCode, body = null) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: body === null
      ? ''
      : JSON.stringify(body),
  };
}

function httpError(
  statusCode,
  message,
  details = null
) {
  const body = {
    error: message,
  };

  if (details) {
    body.details = details;
  }

  return httpResponse(statusCode, body);
}

function normalizeCep(value) {
  const digits = String(value || '')
    .replace(/\D/g, '');

  return digits.length === 8
    ? digits
    : '';
}

function formatCep(value) {
  const digits = normalizeCep(value);

  if (!digits) {
    return '';
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parsePossibleJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function getUserCondominiumCep(user) {
  if (!user) {
    return '';
  }

  const directCep =
    user.cep ||
    user.condominium_cep ||
    user.condominiumCep ||
    user.condominium_id ||
    user.condominiumId;

  if (normalizeCep(directCep)) {
    return formatCep(directCep);
  }

  const condominium =
    parsePossibleJson(user.condominium);

  if (!condominium) {
    return '';
  }

  const condominiumCep =
    condominium.cep ||
    condominium.condominium_cep ||
    condominium.condominiumCep ||
    condominium.condominium_id ||
    condominium.id;

  return formatCep(condominiumCep);
}

function parseRequestBody(event) {
  if (!event.body) {
    return {};
  }

  const rawBody = event.isBase64Encoded
    ? Buffer
        .from(event.body, 'base64')
        .toString('utf8')
    : event.body;

  return JSON.parse(rawBody);
}

function getBearerToken(event) {
  const headers = event.headers || {};

  const authorization =
    headers.authorization ||
    headers.Authorization ||
    '';

  const match = String(authorization)
    .match(/^Bearer\s+(.+)$/i);

  return match
    ? match[1].trim()
    : '';
}

function isValidLivekitUrl(value) {
  return /^wss?:\/\//i.test(
    String(value || '')
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return httpError(
      405,
      'Método não permitido. Use POST.'
    );
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return httpError(
      500,
      'Supabase administrativo não configurado no servidor.'
    );
  }

  if (
    !LIVEKIT_API_KEY ||
    !LIVEKIT_API_SECRET ||
    !LIVEKIT_URL
  ) {
    return httpError(
      500,
      'Servidor de vídeo não configurado. Contate o administrador.'
    );
  }

  if (!isValidLivekitUrl(LIVEKIT_URL)) {
    return httpError(
      500,
      'LIVEKIT_URL inválida. Use uma URL iniciada por wss://.'
    );
  }

  try {
    let body;

    try {
      body = parseRequestBody(event);
    } catch (error) {
      console.error(
        'Corpo inválido em livekit-token:',
        error
      );

      return httpError(
        400,
        'Corpo da requisição inválido.'
      );
    }

    const assemblyIdNum =
      Number(body.assembly_id);

    if (
      !Number.isInteger(assemblyIdNum) ||
      assemblyIdNum <= 0
    ) {
      return httpError(
        400,
        'ID da assembleia inválido.'
      );
    }

    const authToken =
      getBearerToken(event);

    if (!authToken) {
      return httpError(
        401,
        'Autenticação necessária.'
      );
    }

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser(
      authToken
    );

    if (
      authError ||
      !authData ||
      !authData.user
    ) {
      console.warn(
        'Falha ao validar usuário no Supabase Auth:',
        authError && authError.message
      );

      return httpError(
        401,
        'Token de autenticação inválido ou expirado.'
      );
    }

    const supabaseUser =
      authData.user;

    const userEmail =
      String(supabaseUser.email || '')
        .trim()
        .toLowerCase();

    if (!userEmail) {
      return httpError(
        401,
        'O usuário autenticado não possui e-mail.'
      );
    }

    const {
      data: user,
      error: userError,
    } = await supabase
      .from('users')
      .select(
        'name, email, user_type, cpf, phone, condominium'
      )
      .eq('email', userEmail)
      .maybeSingle();

    if (userError || !user) {
      console.warn(
        'Usuário não encontrado na tabela users:',
        userError && userError.message
      );

      return httpError(
        401,
        'Usuário não encontrado no sistema.'
      );
    }

    const {
      data: userCondoData,
      error: userCondoError,
    } = await supabase
      .from('user_condominiums')
      .select(
        'condominium_id, apartment, block'
      )
      .eq('user_email', userEmail)
      .limit(1)
      .maybeSingle();

    if (userCondoError) {
      console.warn(
        'Falha ao consultar user_condominiums:',
        userCondoError.message
      );
    }

    const linkedCep =
      userCondoData &&
      userCondoData.condominium_id
        ? formatCep(
            userCondoData.condominium_id
          )
        : '';

    const userCep =
      linkedCep ||
      getUserCondominiumCep(user);

    if (!userCep) {
      return httpError(
        403,
        'Usuário não possui condomínio associado.'
      );
    }

    const {
      data: assembly,
      error: assemblyError,
    } = await supabase
      .from('scheduled_assemblies')
      .select(`
        id,
        public_id,
        cep,
        title,
        description,
        date,
        start_time,
        end_time,
        status,
        created_by,
        assembly_type,
        expected_duration_minutes,
        livekit_room_name,
        started_at,
        ended_at
      `)
      .eq('id', assemblyIdNum)
      .maybeSingle();

    if (
      assemblyError ||
      !assembly
    ) {
      console.warn(
        'Assembleia não encontrada:',
        assemblyError &&
          assemblyError.message
      );

      return httpError(
        404,
        'Assembleia não encontrada.'
      );
    }

    const assemblyCep =
      formatCep(assembly.cep);

    if (!assemblyCep) {
      return httpError(
        500,
        'A assembleia não possui um CEP válido.'
      );
    }

    if (
      normalizeCep(assemblyCep) !==
      normalizeCep(userCep)
    ) {
      return httpError(
        403,
        'Esta assembleia pertence a outro condomínio.'
      );
    }

    const assemblyStatus =
      normalizeText(assembly.status);

    const validStatuses = [
      'agendada',
      'em_andamento',
    ];

    if (
      !validStatuses.includes(
        assemblyStatus
      )
    ) {
      if (
        assemblyStatus === 'encerrada'
      ) {
        return httpError(
          409,
          'Assembleia já foi encerrada.'
        );
      }

      if (
        assemblyStatus === 'cancelada'
      ) {
        return httpError(
          409,
          'Assembleia foi cancelada.'
        );
      }

      return httpError(
        409,
        'Status da assembleia não permite entrada.'
      );
    }

    const userType =
      normalizeText(user.user_type);

    const createdBy =
      String(assembly.created_by || '')
        .trim()
        .toLowerCase();

    const isOrganizer =
      createdBy === userEmail;

    const isSindico =
      userType === 'sindico';

    const isPorteiro =
      userType === 'porteiro';

    const isMorador =
      userType === 'morador';

    if (isPorteiro) {
      return httpError(
        403,
        'Porteiros não podem participar de assembleias.'
      );
    }

    if (
      !isMorador &&
      !isSindico &&
      !isOrganizer
    ) {
      return httpError(
        403,
        'Tipo de usuário não autorizado.'
      );
    }

    const canPublish = true;
    const canSubscribe = true;

    const canManage =
      isOrganizer || isSindico;

    const canScreenShare =
      canManage;

    /*
     * O LiveKit exige os valores do enum
     * TrackSource, e não strings.
     */
    const canPublishSources = [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
    ];

    /*
     * Essa segunda lista é usada apenas
     * no JSON enviado ao frontend.
     */
    const canPublishSourceNames = [
      'camera',
      'microphone',
    ];

    if (canScreenShare) {
      canPublishSources.push(
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO
      );

      canPublishSourceNames.push(
        'screen_share',
        'screen_share_audio'
      );
    }

    const participantIdentity =
      `user-${supabaseUser.id}-assembly-${assembly.id}`;

    const participantName =
      String(
        user.name ||
        userEmail
      ).trim();

    let roomName =
      String(
        assembly.livekit_room_name || ''
      ).trim();

    if (!roomName) {
      roomName =
        `assembleia-${assembly.id}-${normalizeCep(
          assemblyCep
        )}`;

      const {
        error: updateError,
      } = await supabase
        .from('scheduled_assemblies')
        .update({
          livekit_room_name: roomName,
          updated_at:
            new Date().toISOString(),
        })
        .eq('id', assembly.id);

      if (updateError) {
        console.error(
          'Erro ao salvar o nome da sala:',
          updateError
        );

        return httpError(
          500,
          'Erro ao configurar sala da assembleia.'
        );
      }
    }

    const participantMetadata =
      JSON.stringify({
        user_email: userEmail,
        user_name: participantName,
        user_type: user.user_type,
        user_cpf: user.cpf || null,
        condominium_cep: userCep,
        assembly_id: assembly.id,
        is_organizer: isOrganizer,
        is_sindico: isSindico,
        can_manage: canManage,
      });

    let livekitAccessToken;

    try {
      livekitAccessToken =
        new AccessToken(
          LIVEKIT_API_KEY,
          LIVEKIT_API_SECRET,
          {
            identity:
              participantIdentity,

            name:
              participantName,

            ttl:
              '8h',

            metadata:
              participantMetadata,
          }
        );

      livekitAccessToken.addGrant({
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
      });
    } catch (error) {
      console.error(
        'Erro ao criar a credencial do LiveKit:',
        error
      );

      return httpError(
        500,
        'Erro ao criar credencial de acesso.'
      );
    }

    let signedToken;

    try {
      signedToken =
        await livekitAccessToken.toJwt();
    } catch (error) {
      console.error(
        'Erro ao assinar token do LiveKit:',
        error
      );

      return httpError(
        500,
        'Erro ao assinar credencial de acesso.'
      );
    }

    /*
     * O erro ao registrar o log não deve
     * impedir a entrada na assembleia.
     */
    try {
      const {
        error: logError,
      } = await supabase
        .from('assembly_event_logs')
        .insert({
          assembly_id:
            assembly.id,

          cep:
            assemblyCep,

          event_type:
            'participant_joined_token',

          event_payload: {
            user_email:
              userEmail,

            user_name:
              participantName,

            user_type:
              user.user_type,

            room_name:
              roomName,
          },

          created_by:
            userEmail,

          created_at:
            new Date().toISOString(),
        });

      if (logError) {
        console.warn(
          'Não foi possível registrar o evento do token:',
          logError.message
        );
      }
    } catch (error) {
      console.warn(
        'Falha inesperada ao registrar evento do token:',
        error
      );
    }

    return httpResponse(200, {
      token: signedToken,
      url: LIVEKIT_URL,
      room: roomName,
      identity: participantIdentity,

      user: {
        email:
          userEmail,

        name:
          participantName,

        type:
          user.user_type,

        cep:
          userCep,
      },

      assembly: {
        id:
          assembly.id,

        public_id:
          assembly.public_id,

        title:
          assembly.title,

        status:
          assembly.status,

        cep:
          assemblyCep,
      },

      permissions: {
        canPublish,
        canSubscribe,

        canPublishSources:
          canPublishSourceNames,

        canManage,
        canScreenShare,

        canRecord:
          canManage,

        canRemoveParticipants:
          canManage,

        canMute:
          canManage,

        isOrganizer,
        isSindico,
      },
    });
  } catch (error) {
    console.error(
      'Erro inesperado na função livekit-token:',
      error
    );

    return httpError(
      500,
      'Erro interno ao gerar credencial de acesso.'
    );
  }
};
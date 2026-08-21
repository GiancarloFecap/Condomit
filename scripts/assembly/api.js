(function () {
  'use strict';

  async function resolveToken() {
    try {
      if (
        typeof window
          .resolveSupabaseAccessToken ===
        'function'
      ) {
        const token =
          await window
            .resolveSupabaseAccessToken();

        if (token) {
          return token;
        }
      }
    } catch (error) {
      console.warn(
        '[AssemblyAPI] Não foi possível obter token por resolveSupabaseAccessToken:',
        error
      );
    }

    try {
      if (
        window.supabase
          ?.auth &&
        typeof window.supabase
          .auth
          .getSession ===
          'function'
      ) {
        const {
          data,
          error
        } =
          await window.supabase
            .auth
            .getSession();

        if (
          !error &&
          data?.session
            ?.access_token
        ) {
          return data
            .session
            .access_token;
        }
      }
    } catch (error) {
      console.warn(
        '[AssemblyAPI] Não foi possível obter sessão oficial do Supabase:',
        error
      );
    }

    try {
      const raw =
        sessionStorage.getItem(
          'sb-session'
        ) ||
        localStorage.getItem(
          'sb-session'
        );

      if (raw) {
        const parsed =
          JSON.parse(raw);

        const token =
          parsed
            ?.access_token ||
          parsed
            ?.session
            ?.access_token ||
          null;

        if (token) {
          return token;
        }
      }
    } catch (_) {}

    return null;
  }

  function buildHeaders(
    token
  ) {
    const headers = {
      'Content-Type':
        'application/json',

      Accept:
        'application/json'
    };

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    return headers;
  }

  async function handleResponse(
    response
  ) {
    let data = null;

    const contentType =
      response.headers
        ?.get?.(
          'content-type'
        ) ||
      '';

    try {
      data =
        contentType.includes(
          'application/json'
        )
          ? await response.json()
          : await response.text();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      const message =
        (
          data &&
          typeof data ===
            'object' &&
          (
            data.message ||
            data.error
          )
        ) ||
        (
          typeof data ===
            'string' &&
          data.trim()
        ) ||
        `Erro ${response.status}: ${response.statusText}`;

      const error =
        new Error(
          message
        );

      error.status =
        response.status;

      error.data =
        data;

      throw error;
    }

    return data;
  }

  async function apiFetch(
    path,
    options = {}
  ) {
    const token =
      await resolveToken();

    const config = {
      ...options,

      headers: {
        ...buildHeaders(
          token
        ),

        ...(
          options.headers ||
          {}
        )
      }
    };

    const response =
      await fetch(
        path,
        config
      );

    return handleResponse(
      response
    );
  }

  async function requireAuthenticatedApiFetch(
    path,
    options = {}
  ) {
    const token =
      await resolveToken();

    if (!token) {
      throw new Error(
        'Sua sessão expirou. Entre novamente e tente outra vez.'
      );
    }

    const config = {
      ...options,

      headers: {
        ...buildHeaders(
          token
        ),

        ...(
          options.headers ||
          {}
        )
      }
    };

    const response =
      await fetch(
        path,
        config
      );

    return handleResponse(
      response
    );
  }

  async function supabaseRpc(
    fnName,
    payload
  ) {
    if (
      window.supabase &&
      typeof window.supabase
        .rpc ===
        'function'
    ) {
      const {
        data,
        error
      } =
        await window.supabase
          .rpc(
            fnName,
            payload || {}
          );

      if (error) {
        throw new Error(
          error.message ||
          `RPC error: ${fnName}`
        );
      }

      return data;
    }

    return requireAuthenticatedApiFetch(
      `/api/proxy/${fnName}`,
      {
        method:
          'POST',

        body:
          JSON.stringify(
            payload || {}
          )
      }
    );
  }

  async function requestLivekitToken(
    assemblyId
  ) {
    const normalizedAssemblyId =
      Number.parseInt(
        String(
          assemblyId ||
          ''
        ),
        10
      );

    if (
      !Number.isInteger(
        normalizedAssemblyId
      ) ||
      normalizedAssemblyId <=
        0
    ) {
      throw new Error(
        'ID da assembleia inválido.'
      );
    }

    try {
      return await requireAuthenticatedApiFetch(
<<<<<<< HEAD
        '/.netlify/functions/livekit-token',
=======
        (window.condomitApiUrl?.('/.netlify/functions/livekit-token') || '/.netlify/functions/livekit-token'),
>>>>>>> 48db672 (Android)
        {
          method:
            'POST',

          body:
            JSON.stringify({
              assembly_id:
                normalizedAssemblyId
            })
        }
      );
    } catch (error) {
      console.error(
        '[AssemblyAPI] Erro ao solicitar token do LiveKit:',
        {
          message:
            error?.message,

          status:
            error?.status,

          data:
            error?.data
        }
      );

      throw error;
    }
  }

  async function requestAssemblyAction(
    action,
    payload
  ) {
    if (!action) {
      throw new Error(
        'action é obrigatória'
      );
    }

    const p =
      payload || {};

    const body = {
      action,
      ...p
    };

    if (
      body.assemblyId &&
      !body.assembly_id
    ) {
      body.assembly_id =
        body.assemblyId;
    }

    delete body
      .assemblyId;

    try {
      return await requireAuthenticatedApiFetch(
<<<<<<< HEAD
        '/.netlify/functions/assembly-action',
=======
        (window.condomitApiUrl?.('/.netlify/functions/assembly-action') || '/.netlify/functions/assembly-action'),
>>>>>>> 48db672 (Android)
        {
          method:
            'POST',

          body:
            JSON.stringify(
              body
            )
        }
      );
    } catch (error) {
      console.warn(
        '[AssemblyAPI] assembly-action falhou; tentando RPC:',
        error?.message ||
        error
      );

      return supabaseRpc(
        'assembly_action',
        {
          action,
          payload:
            payload || {}
        }
      );
    }
  }

  async function sendChatMessage(
    assemblyId,
    cep,
    message
  ) {
    if (
      !assemblyId ||
      !cep ||
      !message
    ) {
      throw new Error(
        'Parâmetros obrigatórios ausentes'
      );
    }

    const sanitized =
      window.AssemblyUtils
        ?.sanitizeMessage
        ? window
            .AssemblyUtils
            .sanitizeMessage(
              message
            )
        : String(
            message
          ).trim();

    if (!sanitized) {
      throw new Error(
        'Mensagem vazia'
      );
    }

    /*
     * Não existe mais fallback
     * para RPC.
     */
    return requireAuthenticatedApiFetch(
<<<<<<< HEAD
      '/.netlify/functions/send-chat',
=======
      (window.condomitApiUrl?.('/.netlify/functions/send-chat') || '/.netlify/functions/send-chat'),
>>>>>>> 48db672 (Android)
      {
        method:
          'POST',

        body:
          JSON.stringify({
            assemblyId,
            cep,
            message:
              sanitized
          })
      }
    );
  }

  async function votePoll(
    pollId,
    optionId,
    assemblyId,
    cep
  ) {
    if (
      !pollId ||
      !optionId ||
      !assemblyId ||
      !cep
    ) {
      throw new Error(
        'Parâmetros obrigatórios ausentes'
      );
    }

    return requireAuthenticatedApiFetch(
<<<<<<< HEAD
      '/.netlify/functions/vote-poll',
=======
      (window.condomitApiUrl?.('/.netlify/functions/vote-poll') || '/.netlify/functions/vote-poll'),
>>>>>>> 48db672 (Android)
      {
        method:
          'POST',

        body:
          JSON.stringify({
            pollId,
            optionId,
            assemblyId,
            cep
          })
      }
    );
  }

  async function raiseHand(
    assemblyId,
    cep
  ) {
    if (
      !assemblyId ||
      !cep
    ) {
      throw new Error(
        'Parâmetros obrigatórios ausentes'
      );
    }

    return requireAuthenticatedApiFetch(
<<<<<<< HEAD
      '/.netlify/functions/raise-hand',
=======
      (window.condomitApiUrl?.('/.netlify/functions/raise-hand') || '/.netlify/functions/raise-hand'),
>>>>>>> 48db672 (Android)
      {
        method:
          'POST',

        body:
          JSON.stringify({
            assemblyId,
            cep
          })
      }
    );
  }

  async function confirmPresence(
    assemblyId,
    cep,
    willAttend
  ) {
    if (
      !assemblyId ||
      !cep
    ) {
      throw new Error(
        'Parâmetros obrigatórios ausentes'
      );
    }

    const normalizedWillAttend =
      willAttend !== false;

    try {
      return await requireAuthenticatedApiFetch(
<<<<<<< HEAD
        '/.netlify/functions/confirm-presence',
=======
        (window.condomitApiUrl?.('/.netlify/functions/confirm-presence') || '/.netlify/functions/confirm-presence'),
>>>>>>> 48db672 (Android)
        {
          method:
            'POST',

          body:
            JSON.stringify({
              assemblyId,
              cep,

              willAttend:
                normalizedWillAttend
            })
        }
      );
    } catch (error) {
      console.warn(
        '[AssemblyAPI] confirm-presence falhou; tentando RPC:',
        error?.message ||
        error
      );

      return supabaseRpc(
        'confirm_presence',
        {
          assembly_id:
            assemblyId,

          cep,

          will_attend:
            normalizedWillAttend
        }
      );
    }
  }

  async function supabaseSelect(
    table,
    options = {}
  ) {
    if (
      window.supabase &&
      typeof window.supabase
        .from ===
        'function'
    ) {
      let query =
        window.supabase
          .from(table)
          .select(
            options.select ||
            '*'
          );

      if (options.eq) {
        Object.keys(
          options.eq
        ).forEach(
          (key) => {
            query =
              query.eq(
                key,
                options.eq[
                  key
                ]
              );
          }
        );
      }

      if (options.neq) {
        Object.keys(
          options.neq
        ).forEach(
          (key) => {
            query =
              query.neq(
                key,
                options.neq[
                  key
                ]
              );
          }
        );
      }

      if (options.gte) {
        Object.keys(
          options.gte
        ).forEach(
          (key) => {
            query =
              query.gte(
                key,
                options.gte[
                  key
                ]
              );
          }
        );
      }

      if (options.order) {
        query =
          query.order(
            options.order
              .column,
            {
              ascending:
                options.order
                  .ascending !==
                false
            }
          );
      }

      if (options.limit) {
        query =
          query.limit(
            options.limit
          );
      }

      if (options.single) {
        query =
          query.maybeSingle();
      }

      const {
        data,
        error
      } =
        await query;

      if (error) {
        throw new Error(
          error.message ||
          `Erro ao consultar ${table}`
        );
      }

      return data;
    }

    if (
      typeof window
        .supabaseFetch !==
      'function'
    ) {
      throw new Error(
        'Supabase não inicializado'
      );
    }

    const qs =
      new URLSearchParams();

    qs.set(
      'select',
      options.select ||
      '*'
    );

    if (options.eq) {
      Object.keys(
        options.eq
      ).forEach(
        (key) => {
          qs.set(
            key,
            `eq.${options.eq[key]}`
          );
        }
      );
    }

    if (options.neq) {
      Object.keys(
        options.neq
      ).forEach(
        (key) => {
          qs.set(
            key,
            `neq.${options.neq[key]}`
          );
        }
      );
    }

    if (options.gte) {
      Object.keys(
        options.gte
      ).forEach(
        (key) => {
          qs.set(
            key,
            `gte.${options.gte[key]}`
          );
        }
      );
    }

    if (options.order) {
      qs.set(
        'order',

        `${
          options.order
            .column
        }.${
          options.order
            .ascending !==
          false
            ? 'asc'
            : 'desc'
        }`
      );
    }

    if (options.limit) {
      qs.set(
        'limit',
        String(
          options.limit
        )
      );
    }

    const data =
      await window.supabaseFetch(
        `/${table}?${qs.toString()}`
      );

    if (
      options.single
    ) {
      return Array.isArray(
        data
      )
        ? data[0] ||
            null
        : data;
    }

    return data;
  }

  async function loadAssemblyList() {
    return supabaseSelect(
      'scheduled_assemblies',
      {
        order: {
          column:
            'date',

          ascending:
            true
        }
      }
    );
  }

  async function loadAssemblyDetail(
    id
  ) {
    if (!id) {
      throw new Error(
        'id é obrigatório'
      );
    }

    const data =
      await supabaseSelect(
        'scheduled_assemblies',
        {
          eq: {
            id
          },

          single:
            true
        }
      );

    return Array.isArray(
      data
    )
      ? data[0] ||
          null
      : data;
  }

  async function loadMessages(
    assemblyId
  ) {
    if (!assemblyId) {
      throw new Error(
        'assemblyId é obrigatório'
      );
    }

    return supabaseSelect(
      'assembly_chat_messages',
      {
        eq: {
          assembly_id:
            assemblyId
        },

        order: {
          column:
            'created_at',

          ascending:
            true
        }
      }
    );
  }

  async function loadPolls(
    assemblyId
  ) {
    if (!assemblyId) {
      throw new Error(
        'assemblyId é obrigatório'
      );
    }

    try {
      return await apiFetch(
<<<<<<< HEAD
        `/.netlify/functions/list-polls?assemblyId=${encodeURIComponent(
=======
        `${window.CondomitPlatform?.isNativeApp?.() ? window.CondomitPlatform.backendOrigin : ''}/.netlify/functions/list-polls?assemblyId=${encodeURIComponent(
>>>>>>> 48db672 (Android)
          assemblyId
        )}`
      );
    } catch (_) {
      return supabaseSelect(
        'assembly_polls',
        {
          eq: {
            assembly_id:
              assemblyId
          },

          order: {
            column:
              'created_at',

            ascending:
              true
          }
        }
      );
    }
  }

  async function loadAgendaItems(
    assemblyId
  ) {
    if (!assemblyId) {
      throw new Error(
        'assemblyId é obrigatório'
      );
    }

    try {
      return await apiFetch(
<<<<<<< HEAD
        `/.netlify/functions/list-agenda?assemblyId=${encodeURIComponent(
=======
        `${window.CondomitPlatform?.isNativeApp?.() ? window.CondomitPlatform.backendOrigin : ''}/.netlify/functions/list-agenda?assemblyId=${encodeURIComponent(
>>>>>>> 48db672 (Android)
          assemblyId
        )}`
      );
    } catch (_) {
      return supabaseSelect(
        'assembly_agenda_items',
        {
          eq: {
            assembly_id:
              assemblyId
          },

          order: {
            column:
              'display_order',

            ascending:
              true
          }
        }
      );
    }
  }

  async function loadParticipants(
    assemblyId
  ) {
    if (!assemblyId) {
      throw new Error(
        'assemblyId é obrigatório'
      );
    }

    return supabaseSelect(
      'assembly_attendance',
      {
        eq: {
          assembly_id:
            assemblyId
        },

        order: {
          column:
            'joined_at',

          ascending:
            true
        }
      }
    );
  }

  window.AssemblyAPI = {
    requestLivekitToken,
    requestAssemblyAction,
    sendChatMessage,
    votePoll,
    raiseHand,
    confirmPresence,
    loadAssemblyList,
    loadAssemblyDetail,
    loadMessages,
    loadPolls,
    loadAgendaItems,
    loadParticipants
  };
})();
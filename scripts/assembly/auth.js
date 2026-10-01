(function () {
  'use strict';

  /**
   * Lê e converte um valor JSON salvo no navegador.
   */
  function readStoredJson(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn(`Não foi possível ler ${key}:`, error);
      return null;
    }
  }

  /**
   * Mantém apenas os números do CEP.
   */
  function normalizeCep(cep) {
    const digits = String(cep || '').replace(/\D/g, '');

    return digits.length === 8
      ? digits
      : '';
  }

  /**
   * Converte o CEP para o formato 00000-000.
   */
  function formatCep(cep) {
    const digits = normalizeCep(cep);

    if (!digits) {
      return '';
    }

    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  /**
   * Retorna o usuário atualmente autenticado.
   *
   * Prioriza condominiumUser porque esse objeto possui as
   * informações do condomínio e do tipo de usuário.
   */
  function getCurrentUser() {
    const appUser =
      readStoredJson(sessionStorage, 'condominiumUser') ||
      readStoredJson(localStorage, 'condominiumUser') ||
      readStoredJson(sessionStorage, 'currentUser') ||
      readStoredJson(localStorage, 'currentUser');

    const storedSession =
      readStoredJson(sessionStorage, 'sb-session') ||
      readStoredJson(localStorage, 'sb-session');

    const authUser =
      storedSession && storedSession.user
        ? storedSession.user
        : null;

    if (appUser && authUser) {
      return {
        ...authUser,
        ...appUser,

        id:
          appUser.id ||
          authUser.id,

        email:
          appUser.email ||
          authUser.email,

        app_metadata: {
          ...(authUser.app_metadata || {}),
          ...(appUser.app_metadata || {})
        },

        user_metadata: {
          ...(authUser.user_metadata || {}),
          ...(appUser.user_metadata || {})
        }
      };
    }

    return appUser || authUser || null;
  }

  /**
   * Procura o CEP diretamente dentro do objeto do usuário.
   */
  function getCepFromUserObject(user) {
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

    if (user.user_metadata) {
      const metadataCep =
        user.user_metadata.cep ||
        user.user_metadata.condominium_cep ||
        user.user_metadata.condominiumCep ||
        user.user_metadata.condominium_id ||
        user.user_metadata.condominiumId;

      if (normalizeCep(metadataCep)) {
        return formatCep(metadataCep);
      }
    }

    if (!user.condominium) {
      return '';
    }

    try {
      const condominium =
        typeof user.condominium === 'string'
          ? JSON.parse(user.condominium)
          : user.condominium;

      const condominiumCep =
        condominium &&
        (
          condominium.cep ||
          condominium.condominium_cep ||
          condominium.condominiumCep ||
          condominium.condominium_id ||
          condominium.id
        );

      if (normalizeCep(condominiumCep)) {
        return formatCep(condominiumCep);
      }
    } catch (error) {
      console.warn(
        'Não foi possível interpretar o condomínio do usuário:',
        error
      );
    }

    return '';
  }

  /**
   * Obtém o access token atual do Supabase.
   */
  async function getAccessToken() {
    try {
      if (
        window.supabase &&
        window.supabase.auth &&
        typeof window.supabase.auth.getSession === 'function'
      ) {
        const { data, error } =
          await window.supabase.auth.getSession();

        if (!error && data && data.session) {
          return data.session.access_token || '';
        }
      }
    } catch (error) {
      console.warn(
        'Não foi possível obter a sessão do Supabase:',
        error
      );
    }

    const storedSession =
      readStoredJson(sessionStorage, 'sb-session') ||
      readStoredJson(localStorage, 'sb-session');

    return (
      storedSession &&
      (
        storedSession.access_token ||
        (
          storedSession.session &&
          storedSession.session.access_token
        )
      )
    ) || '';
  }

  /**
   * Obtém o CEP do condomínio associado ao usuário.
   */
  async function getUserCep(user) {
    user = user || getCurrentUser();

    if (!user) {
      return '';
    }

    /*
     * Primeira tentativa:
     * procurar o CEP diretamente no objeto salvo no navegador.
     */
    const storedCep = getCepFromUserObject(user);

    if (storedCep) {
      return storedCep;
    }

    if (!user.email) {
      console.warn(
        'O usuário autenticado não possui e-mail.'
      );

      return '';
    }

    /*
     * Segunda tentativa:
     * consultar diretamente a tabela user_condominiums.
     */
    if (
      window.supabase &&
      typeof window.supabase.from === 'function'
    ) {
      try {
        const { data, error } = await window.supabase
          .from('user_condominiums')
          .select('condominium_id')
          .eq('user_email', user.email)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn(
            'Erro ao consultar user_condominiums:',
            error.message || error
          );
        }

        if (
          data &&
          normalizeCep(data.condominium_id)
        ) {
          return formatCep(
            data.condominium_id
          );
        }
      } catch (error) {
        console.warn(
          'Falha ao consultar o condomínio pelo Supabase:',
          error
        );
      }
    }

    /*
     * Terceira tentativa:
     * consultar o vínculo pela API do Netlify.
     */
    try {
      const accessToken =
        await getAccessToken();

      const response = await fetch(
        `/api/user_condominiums?user_email=eq.${encodeURIComponent(
          user.email
        )}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(accessToken
              ? {
                  Authorization:
                    `Bearer ${accessToken}`
                }
              : {})
          }
        }
      );

      if (!response.ok) {
        const errorText =
          await response.text();

        console.warn(
          'A API não conseguiu consultar o condomínio:',
          response.status,
          errorText
        );

        return '';
      }

      const result =
        await response.json();

      const row =
        Array.isArray(result)
          ? result[0]
          : result;

      if (
        row &&
        normalizeCep(row.condominium_id)
      ) {
        return formatCep(
          row.condominium_id
        );
      }
    } catch (error) {
      console.warn(
        'Falha ao consultar o condomínio pela API:',
        error
      );
    }

    return '';
  }

  /**
   * Verifica se o usuário possui perfil de síndico.
   */
  function isSindico(user) {
    user = user || getCurrentUser();

    if (!user) {
      return false;
    }

    const possibleRoles = [
      user.type,
      user.user_type,
      user.role,
      user.app_metadata &&
        user.app_metadata.role,
      user.app_metadata &&
        user.app_metadata.user_type,
      user.user_metadata &&
        user.user_metadata.role,
      user.user_metadata &&
        user.user_metadata.user_type
    ]
      .filter(Boolean)
      .map((value) =>
        String(value).trim().toLowerCase()
      );

    if (
      possibleRoles.includes('sindico') ||
      possibleRoles.includes('síndico') ||
      possibleRoles.includes('admin')
    ) {
      return true;
    }

    if (user.condominium) {
      try {
        const condominium =
          typeof user.condominium === 'string'
            ? JSON.parse(user.condominium)
            : user.condominium;

        if (
          condominium &&
          (
            condominium.role === 'sindico' ||
            condominium.role === 'síndico' ||
            condominium.is_sindico === true ||
            condominium.isAdmin === true
          )
        ) {
          return true;
        }
      } catch (error) {
        console.warn(
          'Não foi possível verificar o perfil do condomínio:',
          error
        );
      }
    }

    return false;
  }

  /**
   * Verifica se o usuário é o organizador da assembleia.
   */
  function isOrganizer(user, assembly) {
    user = user || getCurrentUser();

    if (!user || !assembly) {
      return false;
    }

    const createdBy =
      assembly.created_by ||
      assembly.assembly_created_by ||
      assembly.organizer_id ||
      assembly.owner_id;

    const userIdentifiers = [
      user.id,
      user.email
    ]
      .filter(Boolean)
      .map((value) =>
        String(value).trim().toLowerCase()
      );

    if (
      createdBy &&
      userIdentifiers.includes(
        String(createdBy)
          .trim()
          .toLowerCase()
      )
    ) {
      return true;
    }

    if (
      Array.isArray(assembly.organizers)
    ) {
      return assembly.organizers.some(
        (organizer) => {
          const identifier =
            typeof organizer === 'string'
              ? organizer
              : (
                  organizer.id ||
                  organizer.user_id ||
                  organizer.email
                );

          return (
            identifier &&
            userIdentifiers.includes(
              String(identifier)
                .trim()
                .toLowerCase()
            )
          );
        }
      );
    }

    return false;
  }

  /**
   * Verifica se o usuário pertence ao mesmo condomínio
   * da assembleia.
   */
  async function checkAssemblyAccess(
    user,
    assemblyCep
  ) {
    user = user || getCurrentUser();

    if (!user) {
      return {
        allowed: false,
        reason: 'not_authenticated'
      };
    }

    if (!normalizeCep(assemblyCep)) {
      return {
        allowed: false,
        reason: 'invalid_assembly'
      };
    }

    /*
     * Não liberar automaticamente por ser síndico.
     * O CEP do condomínio também precisa ser conferido.
     */
    const userCep =
      await getUserCep(user);

    if (!userCep) {
      return {
        allowed: false,
        reason: 'user_cep_not_found'
      };
    }

    if (
      normalizeCep(userCep) ===
      normalizeCep(assemblyCep)
    ) {
      return {
        allowed: true,
        userCep: formatCep(userCep),
        assemblyCep: formatCep(assemblyCep)
      };
    }

    return {
      allowed: false,
      reason: 'cep_mismatch',
      userCep: formatCep(userCep),
      assemblyCep: formatCep(assemblyCep)
    };
  }

  window.AssemblyAuth = {
    getCurrentUser,
    getUserCep,
    isSindico,
    isOrganizer,
    checkAssemblyAccess,
    normalizeCep,
    formatCep
  };
})();
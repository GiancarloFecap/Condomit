window.SUPABASE_URL = 'https://zoplefkruidaxeapnrjp.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_z9bRGucN09k7_E6taywKIg_FUpIEzaR';

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;

function cryptoRandomUuid() {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
  } catch (_) {}

  const hex = '0123456789abcdef';

  const bytes = new Array(16)
    .fill(0)
    .map(() => Math.floor(Math.random() * 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const out = bytes
    .map((b, i) => {
      const h = hex[b];

      return [3, 5, 7, 9].includes(i)
        ? '-' + h
        : h;
    })
    .join('');

  return out;
}

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json'
};

(function initUiHelpers() {
  const ICONS = {
    success: 'fa-check',
    error: 'fa-xmark',
    warning: 'fa-exclamation',
    info: 'fa-info'
  };

  const DEFAULT_TITLES = {
    success: 'Sucesso',
    error: 'Ops!',
    warning: 'Atenção',
    info: 'Informação'
  };

  function ensureToastContainer() {
    let container =
      document.querySelector(
        '.toast-container'
      );

    if (!container) {
      container =
        document.createElement('div');

      container.className =
        'toast-container';

      document.body.appendChild(
        container
      );
    }

    return container;
  }

  function showToast(
    message,
    type = 'info',
    options = {}
  ) {
    /*
     * A partir da versão 014, todas as notificações visuais utilizam o
     * componente compartilhado de scripts/condomit-alerts.js. Mantemos
     * este fallback porque supabase-client.js também é usado em páginas
     * que podem carregá-lo antes do componente global.
     */
    if (
      typeof window !== 'undefined' &&
      typeof window.showToast === 'function' &&
      window.showToast !== showToast
    ) {
      return window.showToast(message, type, options);
    }

    if (
      typeof message !== 'string' &&
      typeof message !== 'number'
    ) {
      message =
        String(message ?? '');
    }

    type = [
      'success',
      'error',
      'warning',
      'info'
    ].includes(type)
      ? type
      : 'info';

    const title =
      options.title ||
      DEFAULT_TITLES[type];

    const duration =
      typeof options.duration === 'number'
        ? options.duration
        : (
            type === 'error'
              ? 6500
              : 4500
          );

    const container =
      ensureToastContainer();

    const toast =
      document.createElement('div');

    toast.className =
      `toast toast-${type}`;

    toast.setAttribute(
      'role',
      type === 'error' ||
      type === 'warning'
        ? 'alert'
        : 'status'
    );

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas ${ICONS[type]}"></i>
      </div>

      <div class="toast-content">
        ${
          title
            ? '<div class="toast-title"></div>'
            : ''
        }

        <div class="toast-message"></div>
      </div>

      <button
        type="button"
        class="toast-close"
        aria-label="Fechar"
      >
        <i class="fas fa-xmark"></i>
      </button>
    `;

    const titleEl =
      toast.querySelector(
        '.toast-title'
      );

    if (titleEl) {
      titleEl.textContent =
        title;
    }

    toast.querySelector(
      '.toast-message'
    ).textContent =
      message;

    let closeTimer = null;

    const closeToast = () => {
      if (
        toast.classList.contains(
          'toast-leaving'
        )
      ) {
        return;
      }

      toast.classList.add(
        'toast-leaving'
      );

      if (closeTimer) {
        window.clearTimeout(
          closeTimer
        );
      }

      window.setTimeout(
        () => toast.remove(),
        260
      );
    };

    toast
      .querySelector('.toast-close')
      .addEventListener(
        'click',
        closeToast
      );

    if (duration > 0) {
      closeTimer =
        window.setTimeout(
          closeToast,
          duration
        );
    }

    toast.addEventListener(
      'mouseenter',
      () => {
        if (closeTimer) {
          window.clearTimeout(
            closeTimer
          );

          closeTimer = null;
        }
      }
    );

    toast.addEventListener(
      'mouseleave',
      () => {
        if (duration > 0) {
          closeTimer =
            window.setTimeout(
              closeToast,
              duration
            );
        }
      }
    );

    container.appendChild(
      toast
    );

    return closeToast;
  }

  function showModal({
    title,
    message,
    type = 'info',
    confirmText = 'OK',
    cancelText = null,
    onConfirm = null,
    onCancel = null,
    closable = true
  } = {}) {
    type = [
      'success',
      'error',
      'warning',
      'info'
    ].includes(type)
      ? type
      : 'info';

    const backdrop =
      document.createElement('div');

    backdrop.className =
      'modal-backdrop';

    backdrop.setAttribute(
      'role',
      'dialog'
    );

    backdrop.setAttribute(
      'aria-modal',
      'true'
    );

    const hasCancel =
      typeof cancelText === 'string' &&
      cancelText.length > 0;

    backdrop.innerHTML = `
      <div class="modal-box" role="document">
        <div class="modal-header">
          <div class="modal-icon modal-icon-${type}">
            <i class="fas ${ICONS[type]}"></i>
          </div>

          <div class="modal-title-wrap">
            <div class="modal-title"></div>
          </div>
        </div>

        <div class="modal-body"></div>

        <div class="modal-footer">
          ${
            hasCancel
              ? '<button type="button" class="modal-btn modal-btn-secondary modal-cancel"></button>'
              : ''
          }

          <button
            type="button"
            class="modal-btn modal-btn-primary modal-confirm"
          ></button>
        </div>
      </div>
    `;

    backdrop.querySelector(
      '.modal-title'
    ).textContent =
      title ||
      DEFAULT_TITLES[type];

    backdrop.querySelector(
      '.modal-body'
    ).textContent =
      typeof message === 'string' ||
      typeof message === 'number'
        ? String(message)
        : '';

    backdrop.querySelector(
      '.modal-confirm'
    ).textContent =
      confirmText || 'OK';

    if (hasCancel) {
      backdrop.querySelector(
        '.modal-cancel'
      ).textContent =
        cancelText;
    }

    let closed = false;

    const close = (via) => {
      if (closed) {
        return;
      }

      closed = true;

      backdrop.style.animation =
        'modalFadeIn 0.18s ease reverse forwards';

      const box =
        backdrop.querySelector(
          '.modal-box'
        );

      if (box) {
        box.style.animation =
          'modalZoomIn 0.18s ease reverse forwards';
      }

      window.setTimeout(
        () => backdrop.remove(),
        190
      );

      if (
        via === 'confirm' &&
        typeof onConfirm === 'function'
      ) {
        onConfirm();
      }

      if (
        via === 'cancel' &&
        typeof onCancel === 'function'
      ) {
        onCancel();
      }
    };

    backdrop
      .querySelector(
        '.modal-confirm'
      )
      .addEventListener(
        'click',
        () => close('confirm')
      );

    const cancelBtn =
      backdrop.querySelector(
        '.modal-cancel'
      );

    if (cancelBtn) {
      cancelBtn.addEventListener(
        'click',
        () => close('cancel')
      );
    }

    if (
      closable &&
      !hasCancel
    ) {
      backdrop.addEventListener(
        'click',
        (e) => {
          if (
            e.target === backdrop
          ) {
            close('confirm');
          }
        }
      );
    } else if (closable) {
      backdrop.addEventListener(
        'click',
        (e) => {
          if (
            e.target === backdrop
          ) {
            close('cancel');
          }
        }
      );
    }

    document.addEventListener(
      'keydown',
      function escHandler(e) {
        if (
          e.key === 'Escape' &&
          document.body.contains(
            backdrop
          )
        ) {
          document.removeEventListener(
            'keydown',
            escHandler
          );

          close(
            hasCancel
              ? 'cancel'
              : 'confirm'
          );
        }
      }
    );

    document.body.appendChild(
      backdrop
    );

    setTimeout(
      () => {
        const confirmBtn =
          backdrop.querySelector(
            '.modal-confirm'
          );

        if (confirmBtn) {
          confirmBtn.focus();
        }
      },
      50
    );

    return { close };
  }

  window.showToast =
    showToast;

  window.showModal =
    showModal;
})();

/* ============================================================
   AUTENTICAÇÃO / SESSÃO SUPABASE
============================================================ */

function decodeJwtPayload(token) {
  const raw =
    String(
      token || ''
    ).trim();

  if (
    raw.split('.').length !== 3
  ) {
    return null;
  }

  try {
    const payloadPart =
      raw
        .split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const padding =
      '='.repeat(
        (
          4 -
          (
            payloadPart.length %
            4
          )
        ) %
        4
      );

    const decoded =
      atob(
        payloadPart +
        padding
      );

    const json =
      decodeURIComponent(
        Array.prototype.map
          .call(
            decoded,
            (char) =>
              '%' +
              char
                .charCodeAt(0)
                .toString(16)
                .padStart(2, '0')
          )
          .join('')
      );

    return JSON.parse(
      json
    );
  } catch (_) {
    return null;
  }
}

function getSupabaseProjectRef() {
  try {
    return (
      new URL(
        SUPABASE_URL
      )
        .hostname
        .split('.')[0] ||
      ''
    );
  } catch (_) {
    return '';
  }
}

function validateSupabasePublicKeyConfiguration() {
  const key =
    String(
      SUPABASE_ANON_KEY ||
      ''
    ).trim();

  if (
    !key ||
    key.includes(
      'COLE_AQUI_'
    )
  ) {
    return {
      ok: false,

      message:
        'A chave pública do Supabase não foi configurada. Copie a Publishable key do seu projeto em Supabase > Project Settings > API Keys.'
    };
  }

  if (
    key.startsWith(
      'sb_secret_'
    )
  ) {
    return {
      ok: false,

      message:
        'Uma chave secreta do Supabase foi colocada no frontend. Use somente a Publishable key.'
    };
  }

  if (
    key.startsWith(
      'sb_publishable_'
    )
  ) {
    return {
      ok: true,
      type: 'publishable'
    };
  }

  const payload =
    decodeJwtPayload(
      key
    );

  if (!payload) {
    return {
      ok: false,

      message:
        'A chave pública do Supabase é inválida. Copie novamente a Publishable key do projeto.'
    };
  }

  const projectRef =
    getSupabaseProjectRef();

  const isLegacyAnon =
    payload.role ===
      'anon' &&

    payload.iss ===
      'supabase' &&

    (
      !projectRef ||
      payload.ref ===
        projectRef
    ) &&

    (
      !payload.exp ||

      Number(
        payload.exp
      ) >
      Math.floor(
        Date.now() /
        1000
      )
    );

  if (!isLegacyAnon) {
    return {
      ok: false,

      message:
        'A anon key configurada é inválida ou não pertence a este projeto. Copie a Publishable key atual no painel do Supabase.'
    };
  }

  return {
    ok: true,
    type: 'legacy-anon'
  };
}

function isUsableSupabaseUserToken(
  token
) {
  const raw =
    String(
      token || ''
    ).trim();

  const payload =
    decodeJwtPayload(
      raw
    );

  if (!payload) {
    return false;
  }

  if (
    payload.role !==
    'authenticated'
  ) {
    return false;
  }

  const now =
    Math.floor(
      Date.now() /
      1000
    );

  if (
    payload.exp &&
    Number(
      payload.exp
    ) <= now + 5
  ) {
    return false;
  }

  const projectRef =
    getSupabaseProjectRef();

  if (
    projectRef &&
    payload.iss &&
    !String(
      payload.iss
    ).includes(
      projectRef
    )
  ) {
    return false;
  }

  return true;
}

function parseStoredJson(
  rawValue
) {
  if (!rawValue) {
    return null;
  }

  if (
    typeof rawValue === 'object'
  ) {
    return rawValue;
  }

  try {
    return JSON.parse(
      rawValue
    );
  } catch (_) {
    return null;
  }
}

function extractAccessToken(
  value
) {
  if (!value) {
    return null;
  }

  if (
    typeof value === 'string'
  ) {
    const trimmed =
      value.trim();

    if (
      isUsableSupabaseUserToken(
        trimmed
      )
    ) {
      return trimmed;
    }

    const parsed =
      parseStoredJson(
        trimmed
      );

    if (!parsed) {
      return null;
    }

    return extractAccessToken(
      parsed
    );
  }

  if (Array.isArray(value)) {
    for (
      const item of value
    ) {
      const token =
        extractAccessToken(
          item
        );

      if (token) {
        return token;
      }
    }

    return null;
  }

  if (
    typeof value !== 'object'
  ) {
    return null;
  }

  const candidates = [
    value.access_token,
    value.accessToken,
    value.token,
    value?.session?.access_token,
    value?.currentSession?.access_token
  ];

  for (
    const candidate of candidates
  ) {
    if (
      isUsableSupabaseUserToken(
        candidate
      )
    ) {
      return candidate;
    }
  }

  return null;
}

function getSupabaseAccessToken() {
  const storages = [];

  try {
    if (
      typeof sessionStorage !==
      'undefined'
    ) {
      storages.push(
        sessionStorage
      );
    }
  } catch (_) {}

  try {
    if (
      typeof localStorage !==
      'undefined'
    ) {
      storages.push(
        localStorage
      );
    }
  } catch (_) {}

  const preferredKeys = [
    'sb-access-token',
    'sb-session',
    'condominiumUser'
  ];

  for (
    const storage of storages
  ) {
    for (
      const key of preferredKeys
    ) {
      try {
        const token =
          extractAccessToken(
            storage.getItem(
              key
            )
          );

        if (token) {
          return token;
        }
      } catch (_) {}
    }

    try {
      for (
        let index = 0;
        index <
        storage.length;
        index += 1
      ) {
        const key =
          storage.key(
            index
          );

        if (
          !key ||
          !/^sb-.*-auth-token$/i
            .test(key)
        ) {
          continue;
        }

        const token =
          extractAccessToken(
            storage.getItem(
              key
            )
          );

        if (token) {
          return token;
        }
      }
    } catch (_) {}
  }

  return null;
}

async function resolveSupabaseAccessToken() {
  try {
    const authClient =
      window.supabase?.auth;

    if (
      authClient &&
      typeof authClient
        .getSession ===
        'function'
    ) {
      const {
        data,
        error
      } =
        await authClient
          .getSession();

      const token =
        data
          ?.session
          ?.access_token ||
        null;

      if (
        !error &&
        isUsableSupabaseUserToken(
          token
        )
      ) {
        try {
          sessionStorage.setItem(
            'sb-access-token',
            token
          );

          sessionStorage.setItem(
            'sb-session',
            JSON.stringify(
              data.session
            )
          );
        } catch (_) {}

        return token;
      }
    }
  } catch (error) {
    console.warn(
      'Não foi possível recuperar a sessão oficial do Supabase:',
      error
    );
  }

  const storedToken =
    getSupabaseAccessToken();

  if (
    isUsableSupabaseUserToken(
      storedToken
    )
  ) {
    return storedToken;
  }

  return null;
}

async function supabaseFetch(
  path,
  options = {}
) {
  const keyStatus =
    validateSupabasePublicKeyConfiguration();

  if (!keyStatus.ok) {
    throw new Error(
      keyStatus.message
    );
  }

  const accessToken =
    await resolveSupabaseAccessToken();

  const method =
    String(
      options.method ||
      'GET'
    )
      .trim()
      .toUpperCase();

  const requiresAuthenticatedSession =
    [
      'POST',
      'PATCH',
      'PUT',
      'DELETE'
    ].includes(
      method
    );

  if (
    requiresAuthenticatedSession &&
    !accessToken
  ) {
    throw new Error(
      'Sua sessão do Supabase não está disponível. Saia da conta, entre novamente e tente outra vez.'
    );
  }

  const headers = {
    ...SUPABASE_HEADERS,

    ...(
      options.headers ||
      {}
    )
  };

  if (accessToken) {
    headers.Authorization =
      `Bearer ${accessToken}`;
  } else {
    delete headers.Authorization;
  }

  const response =
    await fetch(
      `${SUPABASE_REST_URL}${path}`,
      {
        ...options,
        method,
        headers
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(
            text
          )
        : null;
  } catch (_) {
    data = text;
  }

  if (!response.ok) {
    const errorCode =
      data &&
      typeof data ===
        'object'
        ? data.code
        : null;

    const errorMessage =
      data &&
      typeof data ===
        'object'
        ? (
            data.message ||
            data.error ||
            data.details ||
            data.hint
          )
        : data;

    const message =
      String(
        errorMessage ||
        response.statusText ||
        'Erro no Supabase'
      );

    const error =
      new Error(
        message
      );

    error.status =
      response.status;

    error.code =
      errorCode;

    error.data =
      data;

    if (
      /invalid api key/i
        .test(
          message
        )
    ) {
      console.error(
        'A chave pública configurada em window.SUPABASE_ANON_KEY foi recusada pelo Supabase.'
      );
    }

    if (
      response.status ===
        401 ||

      errorCode ===
        '42501' ||

      /row-level security|policy/i
        .test(
          message
        )
    ) {
      console.error(
        'Operação bloqueada pelo Supabase. Verifique a sessão autenticada e as policies RLS.',
        {
          path,

          method,

          status:
            response.status,

          code:
            errorCode,

          data
        }
      );
    }

    throw error;
  }

  return data;
}

/* ============================================================
   USUÁRIOS
============================================================ */

async function fetchUserByEmail(
  email
) {
  try {
    const response =
      await fetch(
        `/api/users?email=${encodeURIComponent(
          email
        )}`
      );

    const contentType =
      response.headers &&
      response.headers.get
        ? response.headers.get(
            'content-type'
          )
        : '';

    if (
      !response.ok ||
      (
        contentType &&
        !contentType.includes(
          'application/json'
        )
      )
    ) {
      const text =
        await response
          .text()
          .catch(() => '');

      let data = null;

      try {
        data =
          text
            ? JSON.parse(text)
            : null;
      } catch (_) {}

      if (
        data &&
        typeof data === 'object' &&
        (
          Array.isArray(data) ||
          data.email ||
          data.error === undefined
        )
      ) {
        return (
          Array.isArray(data) &&
          data.length
            ? data[0]
            : (
                data &&
                !Array.isArray(data) &&
                data.email
                  ? data
                  : null
              )
        );
      }

      throw new Error(
        data?.error ||
        `Erro ao buscar usuário (HTTP ${response.status})`
      );
    }

    const data =
      await response.json();

    return (
      Array.isArray(data) &&
      data.length
        ? data[0]
        : null
    );
  } catch (error) {
    if (
      error &&
      error.name ===
        'SyntaxError'
    ) {
      throw new Error(
        'Erro ao buscar usuário: resposta inesperada do servidor'
      );
    }

    throw error;
  }
}

function formatCpfMasked(
  raw
) {
  const digits =
    String(raw || '')
      .replace(/\D/g, '');

  if (
    digits.length !== 11
  ) {
    return raw || '';
  }

  return (
    `${digits.slice(0, 3)}.` +
    `${digits.slice(3, 6)}.` +
    `${digits.slice(6, 9)}-` +
    `${digits.slice(9)}`
  );
}

async function fetchUserByCpf(
  cpf
) {
  const normalizedCpf =
    String(cpf || '')
      .replace(/\D/g, '');

  if (
    !normalizedCpf ||
    normalizedCpf.length !== 11
  ) {
    return null;
  }

  const maskedCpf =
    formatCpfMasked(
      normalizedCpf
    );

  try {
    const directResponse =
      await fetch(
        `/api/users?cpf=eq.${encodeURIComponent(
          normalizedCpf
        )}`
      );

    if (
      directResponse.ok
    ) {
      const contentType =
        directResponse.headers.get
          ? directResponse.headers.get(
              'content-type'
            )
          : '';

      if (
        contentType &&
        contentType.includes(
          'application/json'
        )
      ) {
        const data =
          await directResponse.json();

        if (
          Array.isArray(data) &&
          data.length
        ) {
          return data[0];
        }
      }
    }
  } catch (_) {}

  try {
    const maskedResponse =
      await fetch(
        `/api/users?cpf=eq.${encodeURIComponent(
          maskedCpf
        )}`
      );

    if (
      maskedResponse.ok
    ) {
      const contentType =
        maskedResponse.headers.get
          ? maskedResponse.headers.get(
              'content-type'
            )
          : '';

      if (
        contentType &&
        contentType.includes(
          'application/json'
        )
      ) {
        const data =
          await maskedResponse.json();

        if (
          Array.isArray(data) &&
          data.length
        ) {
          return data[0];
        }
      }
    }
  } catch (_) {}

  const attempts = [
    `/users?select=*&cpf=eq.${encodeURIComponent(
      normalizedCpf
    )}&limit=1`,

    `/users?select=*&cpf=eq.${encodeURIComponent(
      maskedCpf
    )}&limit=1`
  ];

  for (
    let i = 0;
    i < attempts.length;
    i += 1
  ) {
    try {
      const data =
        await supabaseFetch(
          attempts[i]
        );

      if (
        Array.isArray(data) &&
        data.length
      ) {
        return data[0];
      }
    } catch (error) {
      console.warn(
        `Tentativa ${i + 1} de busca por CPF (Supabase direto) falhou:`,
        error?.message ||
        error
      );
    }
  }

  try {
    const all =
      await supabaseFetch(
        '/users?select=cpf,name,phone,email,condominium,id,type,cep,condominium_cep,condominium_id,condominiumId'
      );

    if (
      !Array.isArray(all) ||
      !all.length
    ) {
      return null;
    }

    const match =
      all.find(
        (user) =>
          String(
            user?.cpf || ''
          )
            .replace(/\D/g, '') ===
          normalizedCpf
      );

    if (!match) {
      return null;
    }

    try {
      const complete =
        await supabaseFetch(
          `/users?select=*&id=eq.${encodeURIComponent(
            match.id
          )}&limit=1`
        );

      return (
        Array.isArray(complete) &&
        complete.length
          ? complete[0]
          : match
      );
    } catch (_) {
      return match;
    }
  } catch (error) {
    console.error(
      'Erro ao buscar usuário por CPF (fallback):',
      error
    );

    return null;
  }
}

async function createUser(
  user
) {
  const response =
    await fetch(
      '/api/register',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(
            user
          )
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (error) {
    if (response.ok) {
      throw new Error(
        'Erro ao cadastrar usuário: resposta inesperada do servidor'
      );
    }

    data = {
      error:
        `Erro ${response.status} ao cadastrar`
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      'Erro ao cadastrar usuário'
    );
  }

  return Array.isArray(data)
    ? data[0]
    : data;
}

async function updateUserByEmail(
  email,
  updates
) {
  const response =
    await fetch(
      `/api/users?email=${encodeURIComponent(
        email
      )}`,
      {
        method: 'PATCH',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(
            updates
          )
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (error) {
    if (response.ok) {
      return null;
    }

    data = {
      error:
        `Erro ${response.status} ao atualizar`
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      'Erro ao atualizar usuário'
    );
  }

  return (
    Array.isArray(data) &&
    data.length
      ? data[0]
      : data
  );
}

async function createCondominium(
  condo
) {
  const response =
    await fetch(
      '/api/condominiums',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(
            condo
          )
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (error) {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      'Erro ao criar condomínio'
    );
  }

  return Array.isArray(data)
    ? data[0]
    : data;
}

/* ============================================================
   CEP / CONDOMÍNIO DO USUÁRIO
============================================================ */

function parseUserCondominium(
  user
) {
  let condominium =
    user?.condominium ||
    null;

  if (
    typeof condominium ===
    'string'
  ) {
    try {
      condominium =
        JSON.parse(
          condominium
        );
    } catch (_) {
      condominium = null;
    }
  }

  return (
    condominium &&
    typeof condominium ===
      'object'
      ? condominium
      : {}
  );
}

function getUserCondominiumIdentifiers(
  user
) {
  const condominium =
    parseUserCondominium(
      user
    );

  const identifiers = [
    condominium?.cep,
    condominium?.condominium_cep,
    condominium?.condominium_id,
    condominium?.condominiumId,

    user?.cep,
    user?.condominium_cep,
    user?.condominium_id,
    user?.condominiumId
  ]
    .map(
      (value) =>
        String(
          value || ''
        ).replace(
          /\D/g,
          ''
        )
    )
    .filter(Boolean);

  return [
    ...new Set(
      identifiers
    )
  ];
}

function normalizeCepStrict(
  value
) {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  if (
    digits.length !== 8
  ) {
    return null;
  }

  return (
    `${digits.slice(0, 5)}-` +
    `${digits.slice(5)}`
  );
}

function getStoredCurrentUser() {
  const candidates = [];

  try {
    candidates.push(
      sessionStorage.getItem(
        'condominiumUser'
      )
    );
  } catch (_) {}

  try {
    candidates.push(
      localStorage.getItem(
        'condominiumUser'
      )
    );
  } catch (_) {}

  for (
    const rawValue of candidates
  ) {
    const parsed =
      parseStoredJson(
        rawValue
      );

    if (
      parsed &&
      typeof parsed ===
        'object'
    ) {
      return parsed;
    }
  }

  return null;
}

async function resolveUserCondominiumCep(
  user
) {
  const condominium =
    parseUserCondominium(
      user || {}
    );

  const cepCandidates = [
    condominium?.cep,
    condominium?.condominium_cep,
    condominium?.condominium_id,
    condominium?.condominiumId,

    user?.cep,
    user?.condominium_cep,
    user?.condominium_id,
    user?.condominiumId,

    ...(
      getUserCondominiumIdentifiers(
        user || {}
      ) || []
    )
  ];

  for (
    const candidate of
    cepCandidates
  ) {
    const normalized =
      normalizeCepStrict(
        candidate
      );

    if (normalized) {
      return normalized;
    }
  }

  const email =
    String(
      user?.email || ''
    )
      .trim()
      .toLowerCase();

  if (!email) {
    return null;
  }

  try {
    const rows =
      await supabaseFetch(
        `/user_condominiums?select=condominium_id&user_email=eq.${encodeURIComponent(
          email
        )}&limit=1`
      );

    const row =
      Array.isArray(rows)
        ? rows[0]
        : rows;

    const linkedCep =
      normalizeCepStrict(
        row?.condominium_id
      );

    if (linkedCep) {
      return linkedCep;
    }
  } catch (error) {
    console.warn(
      'Não foi possível recuperar o CEP em user_condominiums:',
      error
    );
  }

  return null;
}

/* ============================================================
   VISITANTES
============================================================ */

async function createVisitor(
  visitor
) {
  const accessToken =
    await resolveSupabaseAccessToken();

  if (!accessToken) {
    throw new Error(
      'Sua sessão expirou ou não foi carregada. Saia da conta, entre novamente e tente cadastrar o visitante.'
    );
  }

  const currentUser =
    getStoredCurrentUser();

  if (!currentUser) {
    throw new Error(
      'Não foi possível identificar o usuário conectado.'
    );
  }

  const cep =
    await resolveUserCondominiumCep(
      currentUser
    );

  if (!cep) {
    throw new Error(
      'Não foi possível identificar o CEP do condomínio do usuário.'
    );
  }

  const cpf =
    String(
      visitor?.cpf || ''
    )
      .replace(/\D/g, '');

  const responsibleCpf =
    String(
      visitor?.responsible_cpf ||
      ''
    )
      .replace(/\D/g, '');

  const fullName =
    String(
      visitor?.full_name ||
      ''
    ).trim();

  const rg =
    String(
      visitor?.rg || ''
    ).trim();

  if (
    cpf.length !== 11
  ) {
    throw new Error(
      'Informe um CPF válido para o visitante.'
    );
  }

  if (!fullName) {
    throw new Error(
      'Informe o nome completo do visitante.'
    );
  }

  if (!rg) {
    throw new Error(
      'Informe o RG do visitante.'
    );
  }

  if (
    responsibleCpf.length !== 11
  ) {
    throw new Error(
      'Informe um CPF válido para o responsável.'
    );
  }

  const payload = {
    cep,

    cpf,

    full_name:
      fullName,

    rg,

    phone:
      String(
        visitor?.phone || ''
      ).trim() || null,

    email:
      String(
        visitor?.email || ''
      )
        .trim()
        .toLowerCase() || null,

    responsible_cpf:
      responsibleCpf
  };

  const data =
    await supabaseFetch(
      '/visitors',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          Prefer:
            'return=representation'
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );

  const savedVisitor =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!savedVisitor) {
    throw new Error(
      'O Supabase não confirmou o cadastro do visitante.'
    );
  }

  return savedVisitor;
}

async function getVisitorsByResponsibleCpf(
  responsibleCpf
) {
  const normalizedCpf =
    String(
      responsibleCpf || ''
    )
      .replace(/\D/g, '');

  if (!normalizedCpf) {
    return [];
  }

  try {
    const data =
      await supabaseFetch(
        `/visitors?select=*&responsible_cpf=eq.${encodeURIComponent(
          normalizedCpf
        )}&order=created_at.desc`
      );

    return Array.isArray(data)
      ? data
      : [];
  } catch (error) {
    console.error(
      'Erro ao buscar visitantes por responsável:',
      error
    );

    return [];
  }
}

async function fetchUsersByCpfs(
  cpfs,
  select =
    'cpf,name,phone,email,condominium'
) {
  const normalizedCpfs = [
    ...new Set(
      (
        Array.isArray(cpfs)
          ? cpfs
          : []
      )
        .map(
          (value) =>
            String(
              value || ''
            )
              .replace(
                /\D/g,
                ''
              )
        )
        .filter(
          (value) =>
            value.length === 11
        )
    )
  ];

  if (
    !normalizedCpfs.length
  ) {
    return [];
  }

  const directQueries = [
    `/users?select=${encodeURIComponent(
      select
    )}&cpf=in.(${normalizedCpfs.join(
      ','
    )})`,

    `/users?select=${encodeURIComponent(
      select
    )}&cpf=in.(${normalizedCpfs
      .map(
        (c) =>
          formatCpfMasked(c)
      )
      .join(',')})`
  ];

  for (
    let i = 0;
    i < directQueries.length;
    i += 1
  ) {
    try {
      const data =
        await supabaseFetch(
          directQueries[i]
        );

      if (
        Array.isArray(data) &&
        data.length
      ) {
        const covered =
          new Set(
            data.map(
              (u) =>
                String(
                  u?.cpf || ''
                )
                  .replace(
                    /\D/g,
                    ''
                  )
            )
          );

        const missing =
          normalizedCpfs.filter(
            (c) =>
              !covered.has(c)
          );

        if (
          !missing.length
        ) {
          return data;
        }
      }
    } catch (_) {}
  }

  try {
    const wideSelect =
      select.includes(',')
        ? select
        : 'cpf,name,phone,email,condominium,id';

    const all =
      await supabaseFetch(
        `/users?select=${encodeURIComponent(
          wideSelect
        )}`
      );

    if (
      !Array.isArray(all)
    ) {
      return [];
    }

    return all.filter(
      (user) =>
        normalizedCpfs.includes(
          String(
            user?.cpf || ''
          )
            .replace(
              /\D/g,
              ''
            )
        )
    );
  } catch (error) {
    console.error(
      'Erro ao buscar usuários por CPF (fallback):',
      error
    );

    return [];
  }
}

async function getVisitorsForCondominium(
  user
) {
  /*
   * A partir da migration 010, esta RPC é a fonte principal.
   * Ela filtra diretamente por visitors.cep e pelo condomínio do usuário
   * autenticado, então um visitante cadastrado por morador, síndico ou
   * porteiro aparece para qualquer porteiro vinculado ao mesmo CEP.
   */
  try {
    const rows =
      await supabaseFetch(
        '/rpc/condomit_list_visitors_for_current_condominium',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: '{}'
        }
      );

    if (Array.isArray(rows)) {
      return rows;
    }
  } catch (rpcError) {
    console.warn(
      'RPC de visitantes do condomínio indisponível; usando compatibilidade anterior:',
      rpcError?.message || rpcError
    );
  }

  /* Compatibilidade com bancos que ainda não executaram a migration 010. */
  const condominiumIdentifiers =
    getUserCondominiumIdentifiers(
      user
    );

  if (
    !condominiumIdentifiers.length
  ) {
    return [];
  }

  try {
    const visitors =
      await supabaseFetch(
        '/visitors?select=*&order=created_at.desc'
      );

    const visitorRows =
      Array.isArray(visitors)
        ? visitors
        : [];

    if (
      !visitorRows.length
    ) {
      return [];
    }

    const responsibleUsers =
      await fetchUsersByCpfs(
        visitorRows.map(
          (item) =>
            item?.responsible_cpf
        )
      );

    const responsibleByCpf =
      new Map(
        responsibleUsers.map(
          (responsible) => [
            String(
              responsible?.cpf ||
              ''
            )
              .replace(
                /\D/g,
                ''
              ),

            {
              ...responsible,

              condominium:
                parseUserCondominium(
                  responsible
                )
            }
          ]
        )
      );

    return visitorRows
      .map(
        (visitor) => {
          const responsibleCpf =
            String(
              visitor?.responsible_cpf ||
              ''
            )
              .replace(
                /\D/g,
                ''
              );

          return {
            ...visitor,

            responsible:
              responsibleByCpf.get(
                responsibleCpf
              ) ||
              null
          };
        }
      )
      .filter(
        (visitor) => {
          const visitorCep =
            String(
              visitor?.cep || ''
            )
              .replace(/\D/g, '');

          if (
            visitorCep &&
            condominiumIdentifiers.includes(
              visitorCep
            )
          ) {
            return true;
          }

          const responsibleIdentifiers =
            getUserCondominiumIdentifiers(
              visitor?.responsible
            );

          return responsibleIdentifiers
            .some(
              (identifier) =>
                condominiumIdentifiers
                  .includes(
                    identifier
                  )
            );
        }
      );
  } catch (error) {
    console.error(
      'Erro ao buscar visitantes do condomínio:',
      error
    );

    return [];
  }
}

async function setVisitorReleaseStatus(
  visitorCpf,
  nextStatus
) {
  const normalizedCpf =
    String(visitorCpf || '')
      .replace(/\D/g, '');

  if (normalizedCpf.length !== 11) {
    throw new Error(
      'CPF do visitante inválido.'
    );
  }

  const normalizedStatus =
    String(nextStatus || '')
      .trim()
      .toLowerCase();

  if (!normalizedStatus) {
    throw new Error(
      'Informe o novo status do visitante.'
    );
  }

  const data =
    await supabaseFetch(
      '/rpc/condomit_set_visitor_release_status',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          target_cpf: normalizedCpf,
          next_status: normalizedStatus
        })
      }
    );

  return Array.isArray(data)
    ? data[0] || null
    : data;
}

async function getVisitorAccessLogsForCondominium() {
  const data =
    await supabaseFetch(
      '/rpc/condomit_list_visitor_access_logs',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: '{}'
      }
    );

  return Array.isArray(data)
    ? data
    : [];
}

/* ============================================================
   AVISOS / MORADORES
============================================================ */

async function fetchPendingNoticesCount(
  cep
) {
  if (!cep) {
    return 0;
  }

  const possibleTables = [
    'notifications',
    'notices',
    'pending_notices'
  ];

  for (
    const table of
    possibleTables
  ) {
    try {
      const data =
        await supabaseFetch(
          `/${table}?select=id&condominium_cep=eq.${encodeURIComponent(
            cep
          )}&status=eq.pending`
        );

      if (
        Array.isArray(data)
      ) {
        return data.length;
      }
    } catch (_) {}
  }

  return 0;
}

async function fetchResidentsByCondoCep(
  cep
) {
  if (!cep) {
    return [];
  }

  const normalizedCondoIdentifier =
    String(cep)
      .replace(/\D/g, '');

  const data =
    await supabaseFetch(
      '/users?select=name,user_type,condominium&user_type=eq.morador'
    );

  return (
    Array.isArray(data)
      ? data
      : []
  )
    .map(
      (resident) => {
        let condominium =
          resident?.condominium ||
          null;

        if (
          typeof condominium ===
          'string'
        ) {
          try {
            condominium =
              JSON.parse(
                condominium
              );
          } catch (_) {
            condominium =
              null;
          }
        }

        return {
          ...resident,
          condominium
        };
      }
    )
    .filter(
      (resident) => {
        const residentCep =
          String(
            resident
              ?.condominium
              ?.cep ||
            ''
          )
            .replace(
              /\D/g,
              ''
            );

        const residentCondominiumId =
          String(
            resident
              ?.condominium
              ?.condominium_id ||
            ''
          )
            .replace(
              /\D/g,
              ''
            );

        return (
          (
            residentCep &&
            residentCep ===
              normalizedCondoIdentifier
          ) ||
          (
            residentCondominiumId &&
            residentCondominiumId ===
              normalizedCondoIdentifier
          )
        );
      }
    );
}

/* ============================================================
   ASSEMBLEIAS
============================================================ */

function normalizeCepForDatabase(
  value
) {
  const digits =
    String(
      value || ''
    )
      .replace(/\D/g, '');

  if (
    digits.length !== 8
  ) {
    return '';
  }

  return (
    `${digits.slice(0, 5)}-` +
    `${digits.slice(5)}`
  );
}

async function scheduleAssemblyDb(
  assembly
) {
  const safeAssembly = {
    ...assembly
  };

  const cep =
    normalizeCepForDatabase(
      safeAssembly.cep ||
      safeAssembly.condominium_cep ||
      safeAssembly.condominiumCep ||
      safeAssembly.condominium_id ||
      safeAssembly.condominiumId
    );

  if (!cep) {
    throw new Error(
      'CEP do condomínio inválido. Informe um CEP com 8 dígitos.'
    );
  }

  safeAssembly.cep =
    cep;

  const validStatuses = [
    'agendada',
    'em_andamento',
    'encerrada',
    'cancelada'
  ];

  safeAssembly.status =
    validStatuses.includes(
      String(
        safeAssembly.status ||
        ''
      ).toLowerCase()
    )
      ? String(
          safeAssembly.status
        ).toLowerCase()
      : 'agendada';

  delete safeAssembly
    .condominium_cep;

  delete safeAssembly
    .condominiumCep;

  delete safeAssembly
    .condominium_id;

  delete safeAssembly
    .condominiumId;

  delete safeAssembly
    .updated_at;

  [
    'livekit_room_name',
    'started_at',
    'ended_at'
  ].forEach(
    (field) => {
      if (
        safeAssembly[field] ===
          undefined ||
        safeAssembly[field] ===
          null ||
        safeAssembly[field] ===
          ''
      ) {
        delete safeAssembly[
          field
        ];
      }
    }
  );

  const accessToken =
    await resolveSupabaseAccessToken();

  if (!accessToken) {
    throw new Error(
      'Sua sessão expirou. Entre novamente antes de agendar uma assembleia.'
    );
  }

  let response;

  try {
    response =
      await fetch(
        '/api/assemblies',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${accessToken}`
          },

          body:
            JSON.stringify(
              safeAssembly
            )
        }
      );
  } catch (networkError) {
    throw new Error(
      `Falha ao acessar o servidor de assembleias: ${
        networkError.message ||
        networkError
      }`
    );
  }

  const responseText =
    await response.text();

  let responseData =
    null;

  try {
    responseData =
      responseText
        ? JSON.parse(
            responseText
          )
        : null;
  } catch (_) {
    responseData =
      responseText;
  }

  if (!response.ok) {
    const serverMessage =
      responseData &&
      typeof responseData ===
        'object'
        ? (
            responseData.error ||
            responseData.message
          )
        : responseData;

    throw new Error(
      serverMessage ||
      `Erro HTTP ${response.status} ao salvar a assembleia.`
    );
  }

  const savedAssembly =
    Array.isArray(
      responseData
    )
      ? responseData[0]
      : responseData;

  if (
    !savedAssembly ||
    !savedAssembly.id
  ) {
    throw new Error(
      'O servidor não confirmou a gravação da assembleia no banco de dados.'
    );
  }

  return savedAssembly;
}

function normalizeCondominiumIdentifier(
  value
) {
  return String(
    value || ''
  )
    .replace(/\D/g, '');
}

function getAssemblyCondominiumIdentifiers(
  assembly
) {
  return [
    assembly?.cep,
    assembly?.condominium_cep,
    assembly?.condominiumCep,
    assembly?.condominium_id,
    assembly?.condominiumId
  ]
    .map(
      normalizeCondominiumIdentifier
    )
    .filter(Boolean);
}

async function getScheduledAssemblies() {
  return await supabaseFetch(
    '/scheduled_assemblies?select=*&order=date.asc,start_time.asc'
  );
}

async function getScheduledAssembliesByCep(
  userCep
) {
  if (!userCep) {
    return [];
  }

  const rawIdentifier =
    String(
      userCep || ''
    ).trim();

  const normalizedIdentifier =
    normalizeCondominiumIdentifier(
      rawIdentifier
    );

  function applyFilterLocally(
    rows
  ) {
    const list =
      Array.isArray(rows)
        ? rows
        : [];

    if (
      !normalizedIdentifier &&
      !rawIdentifier
    ) {
      return list;
    }

    return list.filter(
      (assembly) => {
        const identifiers =
          getAssemblyCondominiumIdentifiers(
            assembly
          );

        const matches =
          normalizedIdentifier &&
          identifiers.includes(
            normalizedIdentifier
          );

        const rawMatches =
          rawIdentifier &&
          identifiers.some(
            (x) =>
              x ===
              rawIdentifier
          );

        return (
          matches ||
          rawMatches
        );
      }
    );
  }

  try {
    const data =
      await supabaseFetch(
        '/scheduled_assemblies?select=*&order=date.asc,start_time.asc'
      );

    return applyFilterLocally(
      data
    );
  } catch (error) {
    console.error(
      'Erro ao buscar assembleias agendadas:',
      error
    );

    try {
      const fallback =
        await getScheduledAssemblies();

      return applyFilterLocally(
        fallback
      );
    } catch (
      fallbackError
    ) {
      console.error(
        'Erro ao aplicar fallback de assembleias:',
        fallbackError
      );

      return [];
    }
  }
}

async function deleteScheduledAssemblyById(
  id
) {
  if (!id) {
    return null;
  }

  try {
    const data =
      await supabaseFetch(
        `/scheduled_assemblies?id=eq.${encodeURIComponent(
          String(id)
        )}`,
        {
          method:
            'DELETE',

          headers: {
            Prefer:
              'return=representation'
          }
        }
      );

    return Array.isArray(data)
      ? data[0]
      : data;
  } catch (error) {
    console.error(
      'Erro ao excluir assembleia:',
      error
    );

    throw error;
  }
}

/* ============================================================
   USUÁRIO ATUAL
============================================================ */

function getNormalizedUserType(
  user
) {
  if (!user) {
    return 'morador';
  }

  const t =
    (
      user.type ||
      user.user_type ||
      'morador'
    )
      .toString()
      .trim()
      .toLowerCase();

  if (
    t.startsWith('sind') ||
    t === 'síndico' ||
    t === 'sindico'
  ) {
    return 'sindico';
  }

  if (
    t.startsWith('mora') ||
    t === 'morador'
  ) {
    return 'morador';
  }

  if (
    t.startsWith('porteir') ||
    t === 'porteiro'
  ) {
    return 'porteiro';
  }

  return t || 'morador';
}

async function refreshCurrentUserFromDb() {
  const cached =
    sessionStorage.getItem(
      'condominiumUser'
    );

  if (!cached) {
    return null;
  }

  const user =
    JSON.parse(
      cached
    );

  if (!user?.email) {
    return user;
  }

  const existingType =
    getNormalizedUserType(
      user
    );

  try {
    const fresh =
      await fetchUserByEmail(
        user.email
      );

    if (fresh) {
      const merged = {
        ...user,
        ...fresh
      };

      /*
       * O campo `type` salvo no navegador podia continuar com o cargo
       * antigo mesmo depois de `users.user_type` ser alterado no banco.
       * Isso fazia um morador promovido a síndico continuar vendo o painel
       * de morador até sair e entrar novamente. O banco passa a ser a fonte
       * de verdade para o cargo atual.
       */
      const freshType =
        getNormalizedUserType(
          fresh
        );

      if (
        [
          'sindico',
          'morador',
          'porteiro'
        ].includes(
          freshType
        )
      ) {
        merged.type = freshType;
        merged.user_type = freshType;
      }

      if (fresh.profile_photo || fresh.profilePhoto) {
        merged.profilePhoto = fresh.profile_photo || fresh.profilePhoto;
        merged.profile_photo = fresh.profile_photo || fresh.profilePhoto;
      }

      /*
       * Nunca manter senha em
       * sessionStorage.
       */
      delete merged.password;

      if (!merged.type) {
        merged.type = existingType;
      }

      if (
        ![
          'sindico',
          'morador',
          'porteiro'
        ].includes(
          getNormalizedUserType(merged)
        )
      ) {
        merged.type = existingType;
      } else {
        merged.type = getNormalizedUserType(merged);
      }

      merged.user_type = merged.type;

      if (
        fresh.condominium &&
        typeof fresh.condominium ===
          'object' &&
        user.condominium
      ) {
        merged.condominium = {
          ...user.condominium,
          ...fresh.condominium
        };
      } else if (
        fresh.condominium
      ) {
        try {
          merged.condominium =
            typeof fresh.condominium ===
              'string'
              ? JSON.parse(
                  fresh.condominium
                )
              : fresh.condominium;
        } catch (_) {
          merged.condominium =
            user.condominium ||
            fresh.condominium;
        }
      }

      sessionStorage.setItem(
        'condominiumUser',
        JSON.stringify(
          merged
        )
      );

      try {
        const persistentRaw =
          localStorage.getItem(
            'condominiumPersistentUser'
          );

        const persistent =
          persistentRaw
            ? JSON.parse(persistentRaw)
            : {};

        localStorage.setItem(
          'condominiumPersistentUser',
          JSON.stringify({
            ...(persistent && typeof persistent === 'object' ? persistent : {}),
            email: merged.email || user.email,
            name: merged.name || user.name || null,
            type: merged.type,
            user_type: merged.type,
            t: Date.now()
          })
        );
      } catch (_) {}

      return merged;
    }
  } catch (err) {
    console.warn(
      'Não foi possível atualizar dados do usuário do banco:',
      err
    );
  }

  if (!user.type) {
    user.type =
      existingType;
  }

  return user;
}

/* ============================================================
   LOGOUT
============================================================ */

async function performFullLogout(
  redirectPath = null
) {
  try {
    const authClient =
      window.supabase?.auth;

    if (
      authClient &&
      typeof authClient.signOut ===
        'function'
    ) {
      try {
        await authClient.signOut({
          scope: 'global'
        });
      } catch (err) {
        console.warn(
          'signOut Supabase falhou, continuando limpeza local:',
          err
        );
      }
    }
  } catch (err) {
    console.warn(
      'auth signOut catch outer:',
      err
    );
  }

  try {
    if (
      typeof sessionStorage !==
      'undefined'
    ) {
      const removeKeys = [];

      for (
        let i = 0;
        i <
        sessionStorage.length;
        i += 1
      ) {
        const key =
          sessionStorage.key(i);

        if (key) {
          removeKeys.push(
            key
          );
        }
      }

      removeKeys.forEach(
        (k) =>
          sessionStorage.removeItem(
            k
          )
      );
    }
  } catch (_) {}

  try {
    if (
      typeof localStorage !==
      'undefined'
    ) {
      const removeKeys = [];

      for (
        let i = 0;
        i <
        localStorage.length;
        i += 1
      ) {
        const key =
          localStorage.key(i);

        if (
          key &&
          key.startsWith(
            'condomit.notifications.'
          )
        ) {
          /*
           * Notificações e estado de leitura pertencem ao condomínio/usuário
           * e não devem desaparecer apenas porque a sessão foi encerrada.
           */
          continue;
        }

        if (
          key &&
          (
            key.startsWith(
              'condomit.'
            ) ||
            key.startsWith(
              'condominium'
            ) ||
            key.startsWith(
              'sb-'
            ) ||
            key.startsWith(
              'release_statuses:'
            ) ||
            key.startsWith(
              'porteiro:'
            ) ||
            /^sb-.*-auth-token$/i.test(key) ||
            key
              .toLowerCase()
              .includes(
                'condomit'
              ) ||
            key
              .toLowerCase()
              .includes(
                'visitor'
              ) ||
            key
              .toLowerCase()
              .includes(
                'provider-control'
              ) ||
            key
              .toLowerCase()
              .includes(
                'access-log'
              ) ||
            key
              .toLowerCase()
              .includes(
                'release-status'
              )
          )
        ) {
          removeKeys.push(
            key
          );
        }
      }

      removeKeys.forEach(
        (k) =>
          localStorage.removeItem(
            k
          )
      );

      try {
        localStorage.removeItem(
          'condominiumPersistentUser'
        );
      } catch (_) {}

      try {
        localStorage.removeItem(
          'sb-localhost-auth-token'
        );
      } catch (_) {}

      try {
        localStorage.removeItem(
          'sb-127.0.0.1-auth-token'
        );
      } catch (_) {}

      /*
       * Mantém uma marca fora das chaves de sessão da Condomit/Supabase.
       * Ela impede que inicio.html/entrar.html restaurem uma sessão antiga
       * logo após um logout explícito. A marca só é removida após um novo
       * login concluído com sucesso.
       */
      try {
        localStorage.setItem(
          'authExplicitLogoutAt',
          String(Date.now())
        );
      } catch (_) {}
    }
  } catch (_) {}

  try {
    if (
      typeof document !==
        'undefined' &&
      document.cookie
    ) {
      document.cookie
        .split(';')
        .forEach(
          (c) => {
            const name =
              c
                .trim()
                .split('=')[0];

            if (name) {
              const clean =
                (domain) => {
                  try {
                    document.cookie =
                      `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; ${
                        domain
                          ? `domain=${domain};`
                          : ''
                      }`;
                  } catch (_) {}
                };

              clean('');

              clean(
                window.location
                  .hostname
              );
            }
          }
        );
    }
  } catch (_) {}

  const destination =
    redirectPath ||
    (
      typeof window !==
        'undefined' &&
      window.location
        ?.pathname
        ?.includes(
          '/pages/'
        )
        ? '../inicio.html'
        : 'inicio.html'
    );

  try {
    window.location.replace(
      destination
    );
  } catch (_) {
    window.location.href =
      destination;
  }
}

/* ============================================================
   PRESTADORES DE SERVIÇO
============================================================ */

async function listServiceProvidersByCep(
  cep
) {
  const cepDigits =
    String(cep || '')
      .replace(/\D/g, '');

  if (cepDigits.length !== 8) {
    return [];
  }

  try {
    /*
     * A policy RLS já limita a leitura ao(s) condomínio(s) do usuário.
     * Buscamos os registros permitidos e comparamos o CEP sem máscara
     * para aceitar tanto 04284-070 quanto 04284070.
     */
    const data = await supabaseFetch(
      '/service_providers?select=*&order=service_date.desc,created_at.desc'
    );

    return (Array.isArray(data) ? data : [])
      .filter((row) =>
        String(row?.cep || '').replace(/\D/g, '') === cepDigits
      );
  } catch (error) {
    console.error(
      'Erro ao listar prestadores por CEP:',
      error
    );
    return [];
  }
}

async function createServiceProvider(
  payload
) {
  const cepDigits =
    String(payload?.cep || '')
      .replace(/\D/g, '');

  const cep =
    cepDigits.length === 8
      ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
      : '';

  const normalizedEmail =
    String(payload?.email || '')
      .trim()
      .toLowerCase();

  if (!cep || !normalizedEmail) {
    throw new Error(
      'CEP e e-mail são obrigatórios.'
    );
  }

  const statusAliases = {
    scheduled: 'agendado',
    agendado: 'agendado',
    active: 'em andamento',
    in_progress: 'em andamento',
    'em andamento': 'em andamento',
    completed: 'concluído',
    concluido: 'concluído',
    'concluído': 'concluído',
    inactive: 'cancelado',
    blocked: 'cancelado',
    cancelado: 'cancelado'
  };

  const requestedStatus =
    String(
      payload?.initial_status ||
      payload?.status ||
      'agendado'
    )
      .trim()
      .toLowerCase();

  const row = {
    email: normalizedEmail,
    cep,
    provider_name: String(
      payload?.provider_name ||
      payload?.name ||
      ''
    ).trim(),
    company: String(payload?.company || '').trim(),
    service: String(payload?.service || '').trim(),
    category: String(payload?.category || 'cleaning').trim(),
    phone: String(payload?.phone || '').trim(),
    service_date: String(
      payload?.service_date ||
      payload?.visitDate ||
      new Date().toISOString().slice(0, 10)
    ).slice(0, 10),
    service_window: String(
      payload?.service_window ||
      payload?.visitWindow ||
      '--'
    ).trim(),
    initial_status:
      statusAliases[requestedStatus] ||
      'agendado'
  };

  if (!row.provider_name || !row.company || !row.service || !row.phone) {
    throw new Error(
      'Preencha todos os campos obrigatórios do prestador.'
    );
  }

  const accessToken =
    await resolveSupabaseAccessToken();

  if (!accessToken) {
    throw new Error(
      'Sua sessão expirou. Entre novamente antes de cadastrar o prestador.'
    );
  }

  try {
    const data = await supabaseFetch(
      '/service_providers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(row)
      }
    );

    const saved = Array.isArray(data)
      ? data[0]
      : data;

    if (!saved) {
      throw new Error(
        'O Supabase não confirmou o cadastro do prestador.'
      );
    }

    return saved;
  } catch (error) {
    const msg = String(
      error?.message ||
      error ||
      ''
    );

    if (
      msg.includes('23505') ||
      /duplicate|already exists/i.test(msg)
    ) {
      throw new Error(
        'Já existe um prestador cadastrado com este e-mail.'
      );
    }

    if (/row-level security|\brls\b|policy/i.test(msg)) {
      throw new Error(
        'O Supabase bloqueou o cadastro do prestador. Execute a migration 011 e confirme que a conta pertence ao mesmo condomínio.'
      );
    }

    if (/foreign key|cep.*not found|condomínio não encontrado/i.test(msg)) {
      throw new Error(
        'O CEP do condomínio não corresponde a um condomínio cadastrado.'
      );
    }

    throw error;
  }
}

async function updateServiceProviderStatus(
  email,
  nextStatus
) {
  const normalizedEmail =
    String(
      email || ''
    )
      .trim()
      .toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const validStatuses = [
    'agendado',
    'em andamento',
    'concluído',
    'cancelado'
  ];

  const status =
    validStatuses.includes(
      String(
        nextStatus || ''
      ).trim()
    )
      ? String(
          nextStatus
        ).trim()
      : 'agendado';

  try {
    const data =
      await supabaseFetch(
        `/service_providers?email=eq.${encodeURIComponent(
          normalizedEmail
        )}`,
        {
          method: 'PATCH',

          headers: {
            Prefer:
              'return=representation'
          },

          body:
            JSON.stringify({
              initial_status:
                status
            })
        }
      );

    return (
      Array.isArray(data) &&
      data.length
        ? data[0]
        : null
    );
  } catch (error) {
    console.error(
      'Erro ao atualizar status do prestador:',
      error
    );

    return null;
  }
}

async function deleteServiceProvider(
  email
) {
  const normalizedEmail =
    String(
      email || ''
    )
      .trim()
      .toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  try {
    await supabaseFetch(
      `/service_providers?email=eq.${encodeURIComponent(
        normalizedEmail
      )}`,
      {
        method:
          'DELETE'
      }
    );

    return true;
  } catch (error) {
    console.error(
      'Erro ao remover prestador:',
      error
    );

    return false;
  }
}

/* ============================================================
   EXPORTAÇÕES GLOBAIS
============================================================ */

window.listServiceProvidersByCep =
  listServiceProvidersByCep;

window.createServiceProvider =
  createServiceProvider;

window.updateServiceProviderStatus =
  updateServiceProviderStatus;

window.deleteServiceProvider =
  deleteServiceProvider;

window.performFullLogout =
  performFullLogout;

window.refreshCurrentUserFromDb =
  refreshCurrentUserFromDb;

window.getNormalizedUserType =
  getNormalizedUserType;

window.fetchUserByEmail =
  fetchUserByEmail;

window.fetchUserByCpf =
  fetchUserByCpf;

window.fetchUsersByCpfs =
  fetchUsersByCpfs;

window.createVisitor =
  createVisitor;

window.getVisitorsByResponsibleCpf =
  getVisitorsByResponsibleCpf;

window.getVisitorsForCondominium =
  getVisitorsForCondominium;

window.setVisitorReleaseStatus =
  setVisitorReleaseStatus;

window.getVisitorAccessLogsForCondominium =
  getVisitorAccessLogsForCondominium;

window.getUserCondominiumIdentifiers =
  getUserCondominiumIdentifiers;

window.validateSupabasePublicKeyConfiguration =
  validateSupabasePublicKeyConfiguration;

window.isUsableSupabaseUserToken =
  isUsableSupabaseUserToken;

window.getSupabaseAccessToken =
  getSupabaseAccessToken;

window.resolveSupabaseAccessToken =
  resolveSupabaseAccessToken;

window.supabaseFetch =
  supabaseFetch;

window.normalizeCepStrict =
  normalizeCepStrict;

window.resolveUserCondominiumCep =
  resolveUserCondominiumCep;

window.scheduleAssemblyDb =
  scheduleAssemblyDb;

window.getScheduledAssemblies =
  getScheduledAssemblies;

window.getScheduledAssembliesByCep =
  getScheduledAssembliesByCep;

window.deleteScheduledAssemblyById =
  deleteScheduledAssemblyById;

/* ============================================================
   SUGESTÕES
============================================================ */

async function saveSuggestion(
  suggestion
) {
  try {
    const data =
      await supabaseFetch(
        '/suggestions',
        {
          method: 'POST',

          headers: {
            Prefer:
              'return=representation'
          },

          body:
            JSON.stringify(
              suggestion
            )
        }
      );

    console.log(
      'Sugestão salva com sucesso:',
      data
    );

    return Array.isArray(data)
      ? data[0]
      : data;
  } catch (error) {
    console.error(
      'Erro ao salvar sugestão:',
      error
    );

    throw error;
  }
}

async function updateSuggestionStatus(
  title,
  newStatus
) {
  try {
    const encodedTitle =
      encodeURIComponent(
        title
      );

    const data =
      await supabaseFetch(
        `/suggestions?title=eq.${encodedTitle}`,
        {
          method: 'PATCH',

          headers: {
            Prefer:
              'return=representation'
          },

          body:
            JSON.stringify({
              status:
                newStatus
            })
        }
      );

    console.log(
      'Status atualizado com sucesso:',
      data
    );

    return Array.isArray(data)
      ? data[0]
      : data;
  } catch (error) {
    console.error(
      'Erro ao atualizar status da sugestão:',
      error
    );

    throw error;
  }
}

async function getSuggestionsByCep(
  userCep
) {
  if (!userCep) {
    return [];
  }

  try {
    const encodedCep =
      encodeURIComponent(
        userCep
      );

    const data =
      await supabaseFetch(
        `/suggestions?select=*&cep=eq.${encodedCep}&order=suggestion_date.desc,suggestion_time.desc`
      );

    return Array.isArray(data)
      ? data
      : [];
  } catch (error) {
    console.error(
      'Erro ao buscar sugestões:',
      error
    );

    return [];
  }
}

window.saveSuggestion =
  saveSuggestion;

window.updateSuggestionStatus =
  updateSuggestionStatus;

window.getSuggestionsByCep =
  getSuggestionsByCep;

/* ============================================================
   DATA
============================================================ */

function formatDate(
  dateStr
) {
  const [
    year,
    month,
    day
  ] =
    dateStr.split('-');

  return (
    `${day}/${month}/${year}`
  );
}

/* ============================================================
   AVATARES
============================================================ */

function syncAllAvatars(
  currentUser
) {
  if (!currentUser) {
    return;
  }

  const name =
    String(
      currentUser.name ||
      ''
    ).trim();

  const initials =
    name
      ? name
          .split(' ')
          .filter(Boolean)
          .map(
            (n) => n[0]
          )
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'US';

  const profilePhoto =
    currentUser.profilePhoto ||
    currentUser.profile_photo ||
    null;

  const topSmallAvatar =
    document.querySelector(
      '.user-profile-small .avatar'
    );

  if (topSmallAvatar) {
    topSmallAvatar.style
      .overflow =
      'hidden';

    if (profilePhoto) {
      topSmallAvatar.innerHTML =
        `<img src="${profilePhoto}" alt="Avatar" />`;

      topSmallAvatar.style
        .background =
        'none';
    } else {
      topSmallAvatar.textContent =
        initials;

      topSmallAvatar.style
        .background =
        '';
    }
  }

  const topAvatar =
    document.getElementById(
      'user-avatar-top'
    );

  if (topAvatar) {
    topAvatar.style.overflow =
      'hidden';

    if (profilePhoto) {
      topAvatar.innerHTML =
        `<img src="${profilePhoto}" alt="Avatar" />`;

      topAvatar.style.background =
        'none';
    } else {
      topAvatar.textContent =
        initials;

      topAvatar.style.background =
        '';
    }
  }

  const assemblyAvatar =
    document.getElementById(
      'user-avatar'
    );

  if (assemblyAvatar) {
    assemblyAvatar.style
      .overflow =
      'hidden';

    if (profilePhoto) {
      assemblyAvatar.innerHTML =
        `<img src="${profilePhoto}" alt="Avatar" />`;

      assemblyAvatar.style
        .background =
        'none';
    } else {
      assemblyAvatar.textContent =
        initials;

      assemblyAvatar.style
        .background =
        '';
    }
  }

  const configAvatar =
    document.getElementById(
      'profile-avatar-card'
    );

  if (configAvatar) {
    configAvatar.style.overflow =
      'hidden';

    if (profilePhoto) {
      configAvatar.innerHTML =
        `<img src="${profilePhoto}" alt="Avatar" />`;

      configAvatar.style.background =
        'none';
    } else {
      configAvatar.textContent =
        initials;

      configAvatar.style.background =
        '';
    }
  }
}

window.syncAllAvatars =
  syncAllAvatars;

/* ============================================================
   STORAGE
============================================================ */

window.addEventListener(
  'storage',
  function (e) {
    if (
      e.key ===
        'condominiumUser' &&
      e.newValue
    ) {
      try {
        const updatedUser =
          JSON.parse(
            e.newValue
          );

        syncAllAvatars(
          updatedUser
        );
      } catch (_) {}
    }

    if (
      e.key ===
        'app-theme' &&
      e.newValue
    ) {
      applyTheme(
        e.newValue
      );
    }

    if (
      e.key ===
        'app-font-size' &&
      e.newValue
    ) {
      applyFontSize(
        e.newValue
      );
    }

    if (
      e.key ===
        'app-language' &&
      e.newValue &&
      typeof applyTranslations ===
        'function'
    ) {
      applyTranslations(
        e.newValue
      );
    }
  }
);

/* ============================================================
   TEMA / FONTE
============================================================ */

function applyTheme(
  theme
) {
  document
    .documentElement
    .setAttribute(
      'data-theme',
      theme
    );

  localStorage.setItem(
    'app-theme',
    theme
  );

  updateThemeButtons(
    theme
  );
}

function applyFontSize(
  size
) {
  document
    .documentElement
    .setAttribute(
      'data-font',
      size
    );

  localStorage.setItem(
    'app-font-size',
    size
  );

  updateFontButtons(
    size
  );
}

function updateThemeButtons(
  theme
) {
  const themeBtns =
    document.querySelectorAll(
      '.theme-btn'
    );

  if (
    themeBtns.length > 0
  ) {
    themeBtns.forEach(
      (b) =>
        b.classList.remove(
          'active'
        )
    );

    const activeBtn =
      document.getElementById(
        `theme-${theme}`
      );

    if (activeBtn) {
      activeBtn.classList.add(
        'active'
      );
    }
  }
}

function updateFontButtons(
  size
) {
  const fontBtns =
    document.querySelectorAll(
      '.font-btn'
    );

  if (
    fontBtns.length > 0
  ) {
    fontBtns.forEach(
      (b) =>
        b.classList.remove(
          'active'
        )
    );

    const activeBtn =
      document.getElementById(
        `font-${size}`
      );

    if (activeBtn) {
      activeBtn.classList.add(
        'active'
      );
    }
  }
}

/* ============================================================
   COBRANÇA MENSAL DO CONDOMÍNIO
============================================================ */

let condomitBillingCache = {
  value: null,
  expiresAt: 0
};

let condomitBillingExpiryTimer =
  null;

function normalizeBillingStatusPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return {
    ...payload,
    can_use: Boolean(payload.can_use),
    status: String(payload.status || '').trim().toLowerCase(),
    plan_id:
      payload.plan_id === null ||
      typeof payload.plan_id === 'undefined'
        ? null
        : payload.plan_id
  };
}

function getStoredCondominiumUser() {
  try {
    const raw =
      sessionStorage.getItem(
        'condominiumUser'
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch (_) {
    return null;
  }
}

function getStoredUserCep(user) {
  return (
    user?.condominium?.cep ||
    user?.condominium?.condominium_id ||
    user?.condominium?.condominium_cep ||
    user?.condominium_cep ||
    user?.cep ||
    ''
  );
}

function addOneCalendarMonth(dateValue) {
  const source =
    new Date(dateValue);

  if (
    Number.isNaN(
      source.getTime()
    )
  ) {
    return null;
  }

  const result =
    new Date(
      source.getTime()
    );

  const originalDay =
    result.getDate();

  result.setDate(1);
  result.setMonth(
    result.getMonth() + 1
  );

  const lastDay =
    new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0
    ).getDate();

  result.setDate(
    Math.min(
      originalDay,
      lastDay
    )
  );

  return result;
}

async function fetchCondomitBillingFallback() {
  const user =
    getStoredCondominiumUser();

  const cep =
    getStoredUserCep(
      user
    );

  if (!cep) {
    return {
      cep: null,
      status: 'no_condominium',
      can_use: true,
      plan_id: null,
      payment_id: null,
      last_paid_at: null,
      due_at: null,
      days_remaining: null
    };
  }

  const response =
    await fetch(
      `/api/pagamento?cep=${encodeURIComponent(
        cep
      )}`
    );

  if (!response.ok) {
    throw new Error(
      'Não foi possível consultar a situação da mensalidade.'
    );
  }

  const rows =
    await response.json();

  const approved =
    (Array.isArray(rows)
      ? rows
      : [])
      .filter(
        (payment) =>
          String(
            payment?.status_pagamento ||
            ''
          )
            .trim()
            .toLowerCase() ===
          'aprovado'
      )
      .sort(
        (a, b) => {
          const aTime =
            new Date(
              a?.data_pagamento ||
              0
            ).getTime();

          const bTime =
            new Date(
              b?.data_pagamento ||
              0
            ).getTime();

          if (
            bTime !== aTime
          ) {
            return bTime - aTime;
          }

          return (
            Number(b?.id || 0) -
            Number(a?.id || 0)
          );
        }
      );

  const payment =
    approved[0] ||
    null;

  if (!payment) {
    return {
      cep,
      status: 'unpaid',
      can_use: false,
      plan_id: null,
      payment_id: null,
      last_paid_at: null,
      due_at: null,
      days_remaining: 0
    };
  }

  const dueAt =
    addOneCalendarMonth(
      payment.data_pagamento
    );

  const active =
    Boolean(
      dueAt &&
      Date.now() <
        dueAt.getTime()
    );

  return {
    cep,
    status:
      active
        ? 'active'
        : 'overdue',
    can_use: active,
    plan_id:
      payment.plano_id ??
      null,
    payment_id:
      payment.id ??
      null,
    last_paid_at:
      payment.data_pagamento ??
      null,
    due_at:
      dueAt
        ? dueAt.toISOString()
        : null,
    days_remaining:
      active && dueAt
        ? Math.max(
            0,
            Math.ceil(
              (
                dueAt.getTime() -
                Date.now()
              ) /
                86400000
            )
          )
        : 0
  };
}

async function getCondomitBillingStatus(
  force = false
) {
  const now =
    Date.now();

  if (
    !force &&
    condomitBillingCache.value &&
    condomitBillingCache.expiresAt >
      now
  ) {
    return condomitBillingCache.value;
  }

  let billing = null;

  try {
    billing =
      normalizeBillingStatusPayload(
        await supabaseFetch(
          '/rpc/condomit_get_billing_status',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: '{}'
          }
        )
      );
  } catch (rpcError) {
    console.warn(
      '[Billing] RPC 017 indisponível; usando consulta de compatibilidade:',
      rpcError?.message ||
        rpcError
    );

    billing =
      normalizeBillingStatusPayload(
        await fetchCondomitBillingFallback()
      );
  }

  if (!billing) {
    throw new Error(
      'Não foi possível determinar a situação da mensalidade.'
    );
  }

  condomitBillingCache = {
    value: billing,
    expiresAt:
      now + 15000
  };

  const user =
    getStoredCondominiumUser();

  if (
    billing.can_use &&
    billing.plan_id &&
    user &&
    user.plan !==
      billing.plan_id
  ) {
    user.plan =
      billing.plan_id;

    try {
      sessionStorage.setItem(
        'condominiumUser',
        JSON.stringify(user)
      );
    } catch (_) {}
  }

  return billing;
}

function clearCondomitBillingCache() {
  condomitBillingCache = {
    value: null,
    expiresAt: 0
  };
}

function scheduleCondomitBillingExpiryCheck(
  billing
) {
  if (
    condomitBillingExpiryTimer
  ) {
    window.clearTimeout(
      condomitBillingExpiryTimer
    );

    condomitBillingExpiryTimer =
      null;
  }

  if (
    !billing?.can_use ||
    !billing?.due_at ||
    isCondomitBillingExemptPage()
  ) {
    return;
  }

  const dueTime =
    new Date(
      billing.due_at
    ).getTime();

  if (
    !Number.isFinite(
      dueTime
    )
  ) {
    return;
  }

  const remaining =
    dueTime - Date.now();

  const maxSleep =
    6 * 60 * 60 * 1000;

  const delay =
    Math.max(
      1000,
      Math.min(
        remaining + 1500,
        maxSleep
      )
    );

  condomitBillingExpiryTimer =
    window.setTimeout(
      async () => {
        try {
          clearCondomitBillingCache();

          const fresh =
            await getCondomitBillingStatus(
              true
            );

          if (
            fresh?.can_use
          ) {
            scheduleCondomitBillingExpiryCheck(
              fresh
            );

            return;
          }

          await enforceCondomitBillingAccess(
            {
              force: true
            }
          );
        } catch (error) {
          console.warn(
            '[Billing] Falha ao verificar vencimento em tempo real:',
            error
          );

          condomitBillingExpiryTimer =
            window.setTimeout(
              () => {
                enforceCondomitBillingAccess(
                  {
                    force: true
                  }
                ).catch(() => {});
              },
              5 * 60 * 1000
            );
        }
      },
      delay
    );
}

function formatCondomitBillingDate(
  value
) {
  if (!value) {
    return '';
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(
      'pt-BR',
      {
        dateStyle: 'long'
      }
    ).format(parsed);
  } catch (_) {
    return parsed.toLocaleDateString(
      'pt-BR'
    );
  }
}

function isCondomitBillingExemptPage() {
  const page =
    String(
      window.location.pathname
        .split('/')
        .pop() || ''
    )
      .trim()
      .toLowerCase();

  return new Set([
    '',
    'inicio.html',
    'entrar.html',
    'cadastrar-se.html',
    'tipo-usuario.html',
    'cadastro-sindico.html',
    'cadastro-morador.html',
    'cadastro-porteiro.html',
    'checkout.html',
    'pagamento-sucesso.html',
    'pagamento-pendente.html',
    'pagamento-falha.html',
    'esqueci-senha.html',
    'redefinir-senha.html',
    'verificar-2fa-email.html',
    'confirmar-2fa.html',
    '2fa-completo.html'
  ]).has(page);
}

function ensureCondomitBillingLockStyles() {
  if (
    document.getElementById(
      'condomit-billing-lock-styles'
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      'style'
    );

  style.id =
    'condomit-billing-lock-styles';

  style.textContent = `
    .condomit-billing-lock {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, .72);
      backdrop-filter: blur(5px);
    }

    .condomit-billing-lock-card {
      width: min(520px, 100%);
      background: var(--card-bg, #ffffff);
      color: var(--text-primary, #111827);
      border: 1px solid rgba(148, 163, 184, .28);
      border-radius: 24px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, .28);
      padding: 30px;
      text-align: center;
    }

    .condomit-billing-lock-icon {
      width: 70px;
      height: 70px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border-radius: 22px;
      background: rgba(245, 158, 11, .14);
      color: #d97706;
      font-size: 30px;
    }

    .condomit-billing-lock-card h2 {
      margin: 0 0 10px;
      font-size: 1.55rem;
      line-height: 1.2;
    }

    .condomit-billing-lock-card p {
      margin: 0;
      color: var(--text-secondary, #64748b);
      line-height: 1.65;
    }

    .condomit-billing-lock-due {
      margin-top: 18px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(245, 158, 11, .1);
      color: #b45309;
      font-weight: 700;
    }

    .condomit-billing-lock-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 24px;
      flex-wrap: wrap;
    }

    .condomit-billing-lock-actions button {
      min-height: 44px;
      border-radius: 12px;
      border: 0;
      padding: 0 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .condomit-billing-pay {
      background: #2563eb;
      color: #fff;
    }

    .condomit-billing-refresh {
      background: rgba(148, 163, 184, .14);
      color: var(--text-primary, #1f2937);
      border: 1px solid rgba(148, 163, 184, .35) !important;
    }

    .condomit-billing-logout {
      background: transparent;
      color: var(--text-secondary, #64748b);
      border: 1px solid rgba(148, 163, 184, .35) !important;
    }

    body.condomit-billing-locked {
      overflow: hidden !important;
    }
  `;

  document.head.appendChild(
    style
  );
}

function removeCondomitBillingLock() {
  const existing =
    document.getElementById(
      'condomit-billing-lock'
    );

  if (existing) {
    existing.remove();
  }

  document.body.classList.remove(
    'condomit-billing-locked'
  );
}

function showCondomitBillingLock(
  billing,
  userType
) {
  ensureCondomitBillingLockStyles();

  removeCondomitBillingLock();

  const isSindico =
    userType === 'sindico';

  const isUnpaid =
    billing?.status ===
    'unpaid';

  const dueLabel =
    formatCondomitBillingDate(
      billing?.due_at
    );

  const overlay =
    document.createElement(
      'div'
    );

  overlay.id =
    'condomit-billing-lock';

  overlay.className =
    'condomit-billing-lock';

  overlay.setAttribute(
    'role',
    'dialog'
  );

  overlay.setAttribute(
    'aria-modal',
    'true'
  );

  const title =
    isUnpaid
      ? 'Pagamento necessário'
      : 'Mensalidade do condomínio vencida';

  const message =
    isSindico
      ? (
          isUnpaid
            ? 'Este condomínio ainda não possui uma mensalidade aprovada. Conclua o pagamento no Mercado Pago para liberar o sistema.'
            : 'A mensalidade mensal deste condomínio venceu. Até a aprovação do novo pagamento, as funcionalidades do condomínio ficam temporariamente indisponíveis.'
        )
      : 'A mensalidade deste condomínio está pendente. As funcionalidades ficam temporariamente indisponíveis até que o síndico regularize o pagamento.';

  overlay.innerHTML = `
    <div class="condomit-billing-lock-card">
      <div class="condomit-billing-lock-icon">
        <i class="fas fa-lock"></i>
      </div>
      <h2>${title}</h2>
      <p>${message}</p>
      ${
        dueLabel && !isUnpaid
          ? `<div class="condomit-billing-lock-due">Vencimento: ${dueLabel}</div>`
          : ''
      }
      <div class="condomit-billing-lock-actions">
        ${
          isSindico
            ? '<button type="button" class="condomit-billing-pay"><i class="fas fa-credit-card"></i> Pagar mensalidade</button>'
            : ''
        }
        <button type="button" class="condomit-billing-refresh"><i class="fas fa-rotate"></i> Atualizar status</button>
        <button type="button" class="condomit-billing-logout">Sair</button>
      </div>
    </div>
  `;

  document.body.appendChild(
    overlay
  );

  document.body.classList.add(
    'condomit-billing-locked'
  );

  overlay
    .querySelector(
      '.condomit-billing-pay'
    )
    ?.addEventListener(
      'click',
      () => {
        window.location.href =
          'checkout.html';
      }
    );

  overlay
    .querySelector(
      '.condomit-billing-refresh'
    )
    ?.addEventListener(
      'click',
      async (event) => {
        const button =
          event.currentTarget;

        button.disabled =
          true;

        const original =
          button.innerHTML;

        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Verificando...';

        try {
          clearCondomitBillingCache();

          const fresh =
            await getCondomitBillingStatus(
              true
            );

          if (
            fresh?.can_use
          ) {
            removeCondomitBillingLock();

            window.location.reload();

            return;
          }

          showCondomitBillingLock(
            fresh,
            userType
          );
        } catch (error) {
          console.error(
            '[Billing] Falha ao atualizar cobrança:',
            error
          );

          if (
            typeof window.showToast ===
            'function'
          ) {
            window.showToast(
              'Não foi possível atualizar a situação do pagamento agora.',
              'error'
            );
          }
        } finally {
          if (
            document.body.contains(
              button
            )
          ) {
            button.disabled =
              false;

            button.innerHTML =
              original;
          }
        }
      }
    );

  overlay
    .querySelector(
      '.condomit-billing-logout'
    )
    ?.addEventListener(
      'click',
      async () => {
        if (
          typeof window.performFullLogout ===
          'function'
        ) {
          await window.performFullLogout();
        } else {
          try {
            sessionStorage.clear();
          } catch (_) {}

          window.location.href =
            'entrar.html';
        }
      }
    );

  setTimeout(
    () => {
      overlay
        .querySelector(
          isSindico
            ? '.condomit-billing-pay'
            : '.condomit-billing-refresh'
        )
        ?.focus();
    },
    30
  );
}

async function enforceCondomitBillingAccess(
  options = {}
) {
  if (
    isCondomitBillingExemptPage() &&
    !options.forceOnExemptPage
  ) {
    return true;
  }

  const user =
    getStoredCondominiumUser();

  if (!user) {
    return true;
  }

  const userType =
    getNormalizedUserType(
      user
    );

  const cep =
    getStoredUserCep(
      user
    );

  if (!cep) {
    return true;
  }

  try {
    const billing =
      await getCondomitBillingStatus(
        Boolean(options.force)
      );

    if (
      billing?.can_use ||
      billing?.status ===
        'no_condominium'
    ) {
      removeCondomitBillingLock();

      if (
        billing?.can_use
      ) {
        scheduleCondomitBillingExpiryCheck(
          billing
        );
      }

      return true;
    }

    showCondomitBillingLock(
      billing,
      userType
    );

    return false;
  } catch (error) {
    console.error(
      '[Billing] Não foi possível verificar a mensalidade:',
      error
    );

    // Falha de rede não bloqueia o sistema por engano.
    return true;
  }
}

/* ============================================================
   SINCRONIZAÇÃO AUTOMÁTICA DE CARGO
   Se outro síndico transferir a função enquanto esta conta estiver
   conectada, o painel muda sem exigir logout/login.
============================================================ */

const condomitRoleSyncState = {
  busy: false,
  timer: null
};

function getCondomitRoleHomePath(role) {
  const normalized =
    getNormalizedUserType({
      type: role
    });

  if (normalized === 'sindico') {
    return 'index.html';
  }

  if (normalized === 'porteiro') {
    return 'index-porteiro.html';
  }

  return 'index-morador.html';
}

function isCondomitRoleSyncExemptPage() {
  const fileName =
    String(
      window.location.pathname || ''
    )
      .split('/')
      .pop()
      .toLowerCase();

  return [
    '',
    'inicio.html',
    'entrar.html',
    'tipo-usuario.html',
    'cadastro-sindico.html',
    'cadastro-morador.html',
    'cadastro-porteiro.html',
    'esqueci-senha.html',
    'redefinir-senha.html',
    'verificar-2fa-email.html',
    'confirmar-2fa.html',
    '2fa-completo.html',
    'condominio_register.html',
    'entrar-condominio.html',
    'entrar-condominio-porteiro.html',
    'checkout.html',
    'pagamento-sucesso.html',
    'pagamento-pendente.html',
    'pagamento-falha.html'
  ].includes(fileName);
}

async function syncCondomitRoleNow(options = {}) {
  if (
    condomitRoleSyncState.busy ||
    isCondomitRoleSyncExemptPage()
  ) {
    return false;
  }

  let cached = null;

  try {
    const raw =
      sessionStorage.getItem(
        'condominiumUser'
      );

    cached = raw
      ? JSON.parse(raw)
      : null;
  } catch (_) {
    cached = null;
  }

  if (!cached?.email) {
    return false;
  }

  const previousRole =
    getNormalizedUserType(
      cached
    );

  condomitRoleSyncState.busy = true;

  try {
    const fresh =
      await refreshCurrentUserFromDb();

    if (!fresh) {
      return false;
    }

    const currentRole =
      getNormalizedUserType(
        fresh
      );

    const destination =
      getCondomitRoleHomePath(
        currentRole
      );

    const currentPage =
      String(
        window.location.pathname || ''
      )
        .split('/')
        .pop()
        .toLowerCase();

    const isRoleHomePage =
      [
        'index.html',
        'index-morador.html',
        'index-porteiro.html'
      ].includes(
        currentPage
      );

    const roleChanged =
      Boolean(
        currentRole &&
        previousRole &&
        currentRole !== previousRole
      );

    const homeNeedsReload =
      Boolean(
        currentRole &&
        isRoleHomePage &&
        currentPage !== destination
      );

    if (
      roleChanged ||
      homeNeedsReload
    ) {
      clearCondomitBillingCache?.();

      if (options.notify !== false) {
        const label =
          currentRole === 'sindico'
            ? 'Síndico'
            : currentRole === 'porteiro'
              ? 'Porteiro'
              : 'Morador';

        window.showToast?.(
          `Seu cargo foi atualizado para ${label}. Atualizando o sistema...`,
          'success'
        );
      }

      window.setTimeout(
        () => {
          window.location.replace(
            destination
          );
        },
        options.notify === false
          ? 0
          : 350
      );

      return true;
    }

    return false;
  } catch (error) {
    console.warn(
      '[Cargo] Não foi possível sincronizar o cargo atual:',
      error?.message || error
    );

    return false;
  } finally {
    condomitRoleSyncState.busy = false;
  }
}

function startCondomitRoleSync() {
  if (
    condomitRoleSyncState.timer ||
    isCondomitRoleSyncExemptPage()
  ) {
    return;
  }

  window.setTimeout(
    () => {
      syncCondomitRoleNow({
        notify: true
      });
    },
    700
  );

  condomitRoleSyncState.timer =
    window.setInterval(
      () => {
        if (!document.hidden) {
          syncCondomitRoleNow({
            notify: true
          });
        }
      },
      4000
    );

  window.addEventListener(
    'focus',
    () => {
      syncCondomitRoleNow({
        notify: true
      });
    }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        syncCondomitRoleNow({
          notify: true
        });
      }
    }
  );
}

window.syncCondomitRoleNow =
  syncCondomitRoleNow;

window.startCondomitRoleSync =
  startCondomitRoleSync;

/* ============================================================
   REDIRECIONAMENTO HOME
============================================================ */

async function redirectToHome() {
  const loggedInUser =
    sessionStorage.getItem(
      'condominiumUser'
    );

  if (!loggedInUser) {
    window.location.href =
      'entrar.html';

    return;
  }

  const user =
    JSON.parse(
      loggedInUser
    );

  const userType =
    getNormalizedUserType(
      user
    );

  if (
    userType === 'morador'
  ) {
    window.location.href =
      'index-morador.html';

    return;
  }

  if (
    userType === 'porteiro'
  ) {
    window.location.href =
      'index-porteiro.html';

    return;
  }

  if (
    userType === 'sindico'
  ) {
    const cep =
      getStoredUserCep(
        user
      );

    if (!cep) {
      window.location.href =
        'condominio_register.html';

      return;
    }

    try {
      const billing =
        await getCondomitBillingStatus(
          true
        );

      if (
        billing?.can_use
      ) {
        window.location.href =
          'index.html';

        return;
      }

      if (
        billing?.status ===
        'overdue'
      ) {
        window.location.href =
          'index.html';

        return;
      }
    } catch (_) {}

    window.location.href =
      'checkout.html';

    return;
  }

  window.location.href =
    'index.html';
}

window.getCondomitBillingStatus =
  getCondomitBillingStatus;

window.clearCondomitBillingCache =
  clearCondomitBillingCache;

window.enforceCondomitBillingAccess =
  enforceCondomitBillingAccess;

window.redirectToHome =
  redirectToHome;

document.addEventListener(
  'DOMContentLoaded',
  function () {
    window.setTimeout(
      () => {
        enforceCondomitBillingAccess()
          .catch(
            (error) =>
              console.warn(
                '[Billing] Falha no guard global:',
                error
              )
          );
      },
      80
    );
  }
);

/* ============================================================
   INICIALIZAÇÃO
============================================================ */

document.addEventListener(
  'DOMContentLoaded',
  async function () {
    const savedTheme =
      localStorage.getItem(
        'app-theme'
      ) ||
      'light';

    const savedFontSize =
      localStorage.getItem(
        'app-font-size'
      ) ||
      'medium';

    applyTheme(
      savedTheme
    );

    applyFontSize(
      savedFontSize
    );

    try {
      await resolveSupabaseAccessToken();
    } catch (error) {
      console.warn(
        'Não foi possível inicializar a sessão do Supabase:',
        error
      );
    }

    try {
      const stored =
        sessionStorage.getItem(
          'condominiumUser'
        );

      if (stored) {
        const user =
          JSON.parse(
            stored
          );

        if (
          user &&
          user.email &&
          typeof refreshCurrentUserFromDb ===
            'function'
        ) {
          const roleBeforeRefresh =
            getNormalizedUserType(user);

          const refreshed =
            await refreshCurrentUserFromDb();

          if (
            refreshed &&
            typeof syncAllAvatars ===
              'function'
          ) {
            syncAllAvatars(
              refreshed
            );
          }

          const roleAfterRefresh =
            refreshed
              ? getNormalizedUserType(refreshed)
              : roleBeforeRefresh;

          if (
            refreshed &&
            roleBeforeRefresh &&
            roleAfterRefresh &&
            roleBeforeRefresh !== roleAfterRefresh &&
            !isCondomitRoleSyncExemptPage()
          ) {
            const destination =
              getCondomitRoleHomePath(
                roleAfterRefresh
              );

            window.showToast?.(
              `Seu cargo foi atualizado. Carregando o painel de ${roleAfterRefresh === 'sindico' ? 'síndico' : roleAfterRefresh === 'porteiro' ? 'porteiro' : 'morador'}...`,
              'success'
            );

            window.setTimeout(
              () => window.location.replace(destination),
              250
            );

            return;
          }
        }
      }
    } catch (err) {
      console.warn(
        'Falha ao atualizar perfil durante inicialização:',
        err
      );
    }

    startCondomitRoleSync();

    document.addEventListener(
      'click',
      function (e) {
        const navItem =
          e.target.closest(
            '.nav-item'
          );

        if (!navItem) {
          return;
        }

        const span =
          navItem.querySelector(
            'span'
          );

        if (
          span &&
          span.textContent
            .trim() ===
            'Início'
        ) {
          e.preventDefault();
          e.stopPropagation();

          redirectToHome();
        }
      },
      true
    );
  }
);
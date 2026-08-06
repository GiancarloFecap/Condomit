window.SUPABASE_URL = 'https://zoplefkruidaxeapnrjp.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;

function cryptoRandomUuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  const hex = '0123456789abcdef';
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const out = bytes.map((b, i) => {
    const h = hex[b];
    return [3, 5, 7, 9].includes(i) ? '-' + h : h;
  }).join('');
  return out;
}

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'info', options = {}) {
    if (typeof message !== 'string' && typeof message !== 'number') {
      message = String(message ?? '');
    }
    type = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    const title = options.title || DEFAULT_TITLES[type];
    const duration = typeof options.duration === 'number' ? options.duration : (type === 'error' ? 6500 : 4500);

    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');

    toast.innerHTML = `
      <div class="toast-icon"><i class="fas ${ICONS[type]}"></i></div>
      <div class="toast-content">
        ${title ? `<div class="toast-title"></div>` : ''}
        <div class="toast-message"></div>
      </div>
      <button type="button" class="toast-close" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
    `;

    const titleEl = toast.querySelector('.toast-title');
    if (titleEl) titleEl.textContent = title;
    toast.querySelector('.toast-message').textContent = message;

    let closeTimer = null;

    const closeToast = () => {
      if (toast.classList.contains('toast-leaving')) return;
      toast.classList.add('toast-leaving');
      if (closeTimer) window.clearTimeout(closeTimer);
      window.setTimeout(() => toast.remove(), 260);
    };

    toast.querySelector('.toast-close').addEventListener('click', closeToast);

    if (duration > 0) {
      closeTimer = window.setTimeout(closeToast, duration);
    }

    toast.addEventListener('mouseenter', () => {
      if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = null; }
    });
    toast.addEventListener('mouseleave', () => {
      if (duration > 0) closeTimer = window.setTimeout(closeToast, duration);
    });

    container.appendChild(toast);
    return closeToast;
  }

  function showModal({ title, message, type = 'info', confirmText = 'OK', cancelText = null, onConfirm = null, onCancel = null, closable = true } = {}) {
    type = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const hasCancel = typeof cancelText === 'string' && cancelText.length > 0;

    backdrop.innerHTML = `
      <div class="modal-box" role="document">
        <div class="modal-header">
          <div class="modal-icon modal-icon-${type}"><i class="fas ${ICONS[type]}"></i></div>
          <div class="modal-title-wrap">
            <div class="modal-title"></div>
          </div>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer">
          ${hasCancel ? `<button type="button" class="modal-btn modal-btn-secondary modal-cancel"></button>` : ''}
          <button type="button" class="modal-btn modal-btn-primary modal-confirm"></button>
        </div>
      </div>
    `;

    backdrop.querySelector('.modal-title').textContent = title || DEFAULT_TITLES[type];
    backdrop.querySelector('.modal-body').textContent = typeof message === 'string' || typeof message === 'number' ? String(message) : '';
    backdrop.querySelector('.modal-confirm').textContent = confirmText || 'OK';
    if (hasCancel) backdrop.querySelector('.modal-cancel').textContent = cancelText;

    let closed = false;
    const close = (via) => {
      if (closed) return;
      closed = true;
      backdrop.style.animation = 'modalFadeIn 0.18s ease reverse forwards';
      const box = backdrop.querySelector('.modal-box');
      if (box) box.style.animation = 'modalZoomIn 0.18s ease reverse forwards';
      window.setTimeout(() => backdrop.remove(), 190);
      if (via === 'confirm' && typeof onConfirm === 'function') onConfirm();
      if (via === 'cancel' && typeof onCancel === 'function') onCancel();
    };

    backdrop.querySelector('.modal-confirm').addEventListener('click', () => close('confirm'));
    const cancelBtn = backdrop.querySelector('.modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => close('cancel'));

    if (closable && !hasCancel) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close('confirm'); });
    } else if (closable) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close('cancel'); });
    }

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && document.body.contains(backdrop)) {
        document.removeEventListener('keydown', escHandler);
        close(hasCancel ? 'cancel' : 'confirm');
      }
    });

    document.body.appendChild(backdrop);
    setTimeout(() => {
      const confirmBtn = backdrop.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.focus();
    }, 50);

    return { close };
  }

  window.showToast = showToast;
  window.showModal = showModal;
})();

function getSupabaseAccessToken() {
  try {
    const t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    if (t) return t;
  } catch (_) {}
  try {
    const s = sessionStorage.getItem('sb-session') || localStorage.getItem('sb-session');
    if (s) {
      const session = JSON.parse(s);
      if (session?.access_token) return session.access_token;
    }
  } catch (_) {}
  try {
    const u = sessionStorage.getItem('condominiumUser');
    if (u) {
      const user = JSON.parse(u);
      if (user?.token) return user.token;
    }
  } catch (_) {}
  return null;
}

async function supabaseFetch(path, options = {}) {
  const accessToken = getSupabaseAccessToken();
  const response = await fetch(`${SUPABASE_REST_URL}${path}`, {
    ...options,
    headers: {
      ...SUPABASE_HEADERS,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }

  if (!response.ok) {
    const message = data?.message || response.statusText || 'Erro no Supabase';
    throw new Error(message);
  }

  return data;
}

async function fetchUserByEmail(email) {
  try {
    const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
    const contentType = response.headers && response.headers.get ? response.headers.get('content-type') : '';
    if (!response.ok || (contentType && !contentType.includes('application/json'))) {
      const text = await response.text().catch(() => '');
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) {}
      if (data && (typeof data === 'object') && (Array.isArray(data) || data.email || data.error === undefined)) {
        return Array.isArray(data) && data.length ? data[0] : (data && !Array.isArray(data) && data.email ? data : null);
      }
      throw new Error(data?.error || `Erro ao buscar usuário (HTTP ${response.status})`);
    }
    const data = await response.json();
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (error) {
    if (error && error.name === 'SyntaxError') {
      throw new Error('Erro ao buscar usuário: resposta inesperada do servidor');
    }
    throw error;
  }
}

function formatCpfMasked(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 11) return raw || '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

async function fetchUserByCpf(cpf) {
  const normalizedCpf = String(cpf || '').replace(/\D/g, '');
  if (!normalizedCpf || normalizedCpf.length !== 11) return null;

  const maskedCpf = formatCpfMasked(normalizedCpf);

  try {
    const directResponse = await fetch(`/api/users?cpf=eq.${encodeURIComponent(normalizedCpf)}`);
    if (directResponse.ok) {
      const contentType = directResponse.headers.get ? directResponse.headers.get('content-type') : '';
      if (contentType && contentType.includes('application/json')) {
        const data = await directResponse.json();
        if (Array.isArray(data) && data.length) return data[0];
      }
    }
  } catch (_) {}

  try {
    const maskedResponse = await fetch(`/api/users?cpf=eq.${encodeURIComponent(maskedCpf)}`);
    if (maskedResponse.ok) {
      const contentType = maskedResponse.headers.get ? maskedResponse.headers.get('content-type') : '';
      if (contentType && contentType.includes('application/json')) {
        const data = await maskedResponse.json();
        if (Array.isArray(data) && data.length) return data[0];
      }
    }
  } catch (_) {}

  const attempts = [
    `/users?select=*&cpf=eq.${encodeURIComponent(normalizedCpf)}&limit=1`,
    `/users?select=*&cpf=eq.${encodeURIComponent(maskedCpf)}&limit=1`
  ];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const data = await supabaseFetch(attempts[i]);
      if (Array.isArray(data) && data.length) return data[0];
    } catch (error) {
      console.warn(`Tentativa ${i + 1} de busca por CPF (Supabase direto) falhou:`, error?.message || error);
    }
  }
  try {
    const all = await supabaseFetch(`/users?select=cpf,name,phone,email,condominium,id,type,cep,condominium_cep,condominium_id,condominiumId`);
    if (!Array.isArray(all) || !all.length) return null;
    const match = all.find((user) => String(user?.cpf || '').replace(/\D/g, '') === normalizedCpf);
    if (!match) return null;
    try {
      const complete = await supabaseFetch(`/users?select=*&id=eq.${encodeURIComponent(match.id)}&limit=1`);
      return Array.isArray(complete) && complete.length ? complete[0] : match;
    } catch (_) {
      return match;
    }
  } catch (error) {
    console.error('Erro ao buscar usuário por CPF (fallback):', error);
    return null;
  }
}

async function createUser(user) {
  const response = await fetch('/api/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(user)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    if (response.ok) {
      throw new Error('Erro ao cadastrar usuário: resposta inesperada do servidor');
    }
    data = { error: `Erro ${response.status} ao cadastrar` };
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Erro ao cadastrar usuário');
  }

  return Array.isArray(data) ? data[0] : data;
}

async function updateUserByEmail(email, updates) {
  const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    if (response.ok) return null;
    data = { error: `Erro ${response.status} ao atualizar` };
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Erro ao atualizar usuário');
  }

  return Array.isArray(data) && data.length ? data[0] : data;
}

async function createCondominium(condo) {
  const response = await fetch('/api/condominiums', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(condo)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Erro ao criar condomínio');
  }

  return Array.isArray(data) ? data[0] : data;
}

async function createVisitor(visitor) {
  const payload = {
    cpf: String(visitor?.cpf || '').replace(/\D/g, ''),
    full_name: String(visitor?.full_name || '').trim(),
    rg: String(visitor?.rg || '').trim(),
    phone: String(visitor?.phone || '').trim() || null,
    email: String(visitor?.email || '').trim() || null,
    responsible_cpf: String(visitor?.responsible_cpf || '').replace(/\D/g, '')
  };

  const data = await supabaseFetch('/visitors', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });

  return Array.isArray(data) ? data[0] : data;
}

async function getVisitorsByResponsibleCpf(responsibleCpf) {
  const normalizedCpf = String(responsibleCpf || '').replace(/\D/g, '');
  if (!normalizedCpf) return [];

  try {
    const data = await supabaseFetch(`/visitors?select=*&responsible_cpf=eq.${encodeURIComponent(normalizedCpf)}&order=created_at.desc`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Erro ao buscar visitantes por responsável:', error);
    return [];
  }
}

function parseUserCondominium(user) {
  let condominium = user?.condominium || null;
  if (typeof condominium === 'string') {
    try {
      condominium = JSON.parse(condominium);
    } catch (_) {
      condominium = null;
    }
  }
  return condominium && typeof condominium === 'object' ? condominium : {};
}

function getUserCondominiumIdentifiers(user) {
  const condominium = parseUserCondominium(user);
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
    .map((value) => String(value || '').replace(/\D/g, ''))
    .filter(Boolean);

  return [...new Set(identifiers)];
}

async function fetchUsersByCpfs(cpfs, select = 'cpf,name,phone,email,condominium') {
  const normalizedCpfs = [...new Set(
    (Array.isArray(cpfs) ? cpfs : [])
      .map((value) => String(value || '').replace(/\D/g, ''))
      .filter((value) => value.length === 11)
  )];

  if (!normalizedCpfs.length) return [];

  const directQueries = [
    `/users?select=${encodeURIComponent(select)}&cpf=in.(${normalizedCpfs.join(',')})`,
    `/users?select=${encodeURIComponent(select)}&cpf=in.(${normalizedCpfs.map((c) => formatCpfMasked(c)).join(',')})`
  ];

  for (let i = 0; i < directQueries.length; i++) {
    try {
      const data = await supabaseFetch(directQueries[i]);
      if (Array.isArray(data) && data.length) {
        const covered = new Set(data.map((u) => String(u?.cpf || '').replace(/\D/g, '')));
        const missing = normalizedCpfs.filter((c) => !covered.has(c));
        if (!missing.length) return data;
      }
    } catch (_) {}
  }

  try {
    const wideSelect = select.includes(',') ? select : 'cpf,name,phone,email,condominium,id';
    const all = await supabaseFetch(`/users?select=${encodeURIComponent(wideSelect)}`);
    if (!Array.isArray(all)) return [];
    return all.filter((user) => normalizedCpfs.includes(String(user?.cpf || '').replace(/\D/g, '')));
  } catch (error) {
    console.error('Erro ao buscar usuários por CPF (fallback):', error);
    return [];
  }
}

async function getVisitorsForCondominium(user) {
  const condominiumIdentifiers = getUserCondominiumIdentifiers(user);
  if (!condominiumIdentifiers.length) return [];

  try {
    const visitors = await supabaseFetch('/visitors?select=*&order=created_at.desc');
    const visitorRows = Array.isArray(visitors) ? visitors : [];
    if (!visitorRows.length) return [];

    const responsibleUsers = await fetchUsersByCpfs(visitorRows.map((item) => item?.responsible_cpf));
    const responsibleByCpf = new Map(
      responsibleUsers.map((responsible) => [
        String(responsible?.cpf || '').replace(/\D/g, ''),
        { ...responsible, condominium: parseUserCondominium(responsible) }
      ])
    );

    return visitorRows
      .map((visitor) => {
        const responsibleCpf = String(visitor?.responsible_cpf || '').replace(/\D/g, '');
        return {
          ...visitor,
          responsible: responsibleByCpf.get(responsibleCpf) || null
        };
      })
      .filter((visitor) => {
        const responsibleIdentifiers = getUserCondominiumIdentifiers(visitor?.responsible);
        return responsibleIdentifiers.some((identifier) => condominiumIdentifiers.includes(identifier));
      });
  } catch (error) {
    console.error('Erro ao buscar visitantes do condomínio:', error);
    return [];
  }
}

async function fetchPendingNoticesCount(cep) {
  if (!cep) return 0;

  const possibleTables = ['notifications', 'notices', 'pending_notices'];
  for (const table of possibleTables) {
    try {
      const data = await supabaseFetch(`/${table}?select=id&condominium_cep=eq.${encodeURIComponent(cep)}&status=eq.pending`);
      if (Array.isArray(data)) {
        return data.length;
      }
    } catch (error) {
      // Table may not exist or query may be invalid; try next option
    }
  }

  return 0;
}

async function fetchResidentsByCondoCep(cep) {
  if (!cep) return [];
  const normalizedCondoIdentifier = String(cep).replace(/\D/g, '');
  const data = await supabaseFetch('/users?select=name,user_type,condominium&user_type=eq.morador');

  return (Array.isArray(data) ? data : [])
    .map((resident) => {
      let condominium = resident?.condominium || null;

      if (typeof condominium === 'string') {
        try {
          condominium = JSON.parse(condominium);
        } catch (_) {
          condominium = null;
        }
      }

      return {
        ...resident,
        condominium
      };
    })
    .filter((resident) => {
      const residentCep = String(resident?.condominium?.cep || '').replace(/\D/g, '');
      const residentCondominiumId = String(resident?.condominium?.condominium_id || '').replace(/\D/g, '');
      return (
        (residentCep && residentCep === normalizedCondoIdentifier) ||
        (residentCondominiumId && residentCondominiumId === normalizedCondoIdentifier)
      );
    });
}

function normalizeCepForDatabase(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length !== 8) {
    return '';
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

async function scheduleAssemblyDb(assembly) {
  const safeAssembly = { ...assembly };

  const cep = normalizeCepForDatabase(
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

  safeAssembly.cep = cep;

  const validStatuses = [
    'agendada',
    'em_andamento',
    'encerrada',
    'cancelada'
  ];

  safeAssembly.status = validStatuses.includes(
    String(safeAssembly.status || '').toLowerCase()
  )
    ? String(safeAssembly.status).toLowerCase()
    : 'agendada';

  delete safeAssembly.condominium_cep;
  delete safeAssembly.condominiumCep;
  delete safeAssembly.condominium_id;
  delete safeAssembly.condominiumId;
  delete safeAssembly.updated_at;

  [
    'livekit_room_name',
    'started_at',
    'ended_at'
  ].forEach((field) => {
    if (
      safeAssembly[field] === undefined ||
      safeAssembly[field] === null ||
      safeAssembly[field] === ''
    ) {
      delete safeAssembly[field];
    }
  });

  const accessToken = getSupabaseAccessToken();

  let response;

  try {
    response = await fetch('/api/assemblies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {})
      },
      body: JSON.stringify(safeAssembly)
    });
  } catch (networkError) {
    throw new Error(
      `Falha ao acessar o servidor de assembleias: ${
        networkError.message || networkError
      }`
    );
  }

  const responseText = await response.text();

  let responseData = null;

  try {
    responseData = responseText
      ? JSON.parse(responseText)
      : null;
  } catch (_) {
    responseData = responseText;
  }

  if (!response.ok) {
    const serverMessage =
      responseData && typeof responseData === 'object'
        ? responseData.error || responseData.message
        : responseData;

    throw new Error(
      serverMessage ||
      `Erro HTTP ${response.status} ao salvar a assembleia.`
    );
  }

  const savedAssembly = Array.isArray(responseData)
    ? responseData[0]
    : responseData;

  if (!savedAssembly || !savedAssembly.id) {
    throw new Error(
      'O servidor não confirmou a gravação da assembleia no banco de dados.'
    );
  }

  return savedAssembly;
}

function normalizeCondominiumIdentifier(value) {
  return String(value || '').replace(/\D/g, '');
}

function getAssemblyCondominiumIdentifiers(assembly) {
  return [
    assembly?.cep,
    assembly?.condominium_cep,
    assembly?.condominiumCep,
    assembly?.condominium_id,
    assembly?.condominiumId
  ]
    .map(normalizeCondominiumIdentifier)
    .filter(Boolean);
}

async function getScheduledAssemblies() {
  return await supabaseFetch('/scheduled_assemblies?select=*&order=date.asc,start_time.asc');
}

async function getScheduledAssembliesByCep(userCep) {
  if (!userCep) return [];
  const rawIdentifier = String(userCep || '').trim();
  const normalizedIdentifier = normalizeCondominiumIdentifier(rawIdentifier);

  function applyFilterLocally(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!normalizedIdentifier && !rawIdentifier) return list;
    return list.filter((assembly) => {
      const identifiers = getAssemblyCondominiumIdentifiers(assembly);
      const matches = normalizedIdentifier && identifiers.includes(normalizedIdentifier);
      const rawMatches = rawIdentifier && identifiers.some((x) => x === rawIdentifier);
      return matches || rawMatches;
    });
  }

  try {
    const data = await supabaseFetch('/scheduled_assemblies?select=*&order=date.asc,start_time.asc');
    return applyFilterLocally(data);
  } catch (error) {
    console.error('Erro ao buscar assembleias agendadas:', error);
    try {
      const fallback = await getScheduledAssemblies();
      return applyFilterLocally(fallback);
    } catch (fallbackError) {
      console.error('Erro ao aplicar fallback de assembleias:', fallbackError);
      return [];
    }
  }
}

async function deleteScheduledAssemblyById(id) {
  if (!id) return null;
  try {
    const data = await supabaseFetch(`/scheduled_assemblies?id=eq.${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' }
    });
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.error('Erro ao excluir assembleia:', error);
    throw error;
  }
}

function getNormalizedUserType(user) {
  if (!user) return 'morador';
  const t = (user.type || user.user_type || 'morador').toString().trim().toLowerCase();
  if (t.startsWith('sind') || t === 'síndico' || t === 'sindico') return 'sindico';
  if (t.startsWith('mora') || t === 'morador') return 'morador';
  if (t.startsWith('porteir') || t === 'porteiro') return 'porteiro';
  return t || 'morador';
}

async function refreshCurrentUserFromDb() {
  const cached = sessionStorage.getItem('condominiumUser');
  if (!cached) return null;
  const user = JSON.parse(cached);
  if (!user?.email) return user;
  const existingType = getNormalizedUserType(user);
  try {
    const fresh = await fetchUserByEmail(user.email);
    if (fresh) {
      const merged = { ...user, ...fresh };
      if (user.password) merged.password = user.password;
      if (!merged.type) merged.type = getNormalizedUserType(fresh);
      if (!merged.type) merged.type = existingType;
      if (!['sindico','morador','porteiro'].includes(merged.type)) {
        merged.type = getNormalizedUserType(merged) || existingType;
      }
      if (fresh.condominium && typeof fresh.condominium === 'object' && user.condominium) {
        merged.condominium = { ...user.condominium, ...fresh.condominium };
      } else if (fresh.condominium) {
        try {
          merged.condominium = typeof fresh.condominium === 'string' ? JSON.parse(fresh.condominium) : fresh.condominium;
        } catch (_) {
          merged.condominium = user.condominium || fresh.condominium;
        }
      }
      sessionStorage.setItem('condominiumUser', JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Não foi possível atualizar dados do usuário do banco:', err);
  }
  if (!user.type) user.type = existingType;
  return user;
}

async function performFullLogout(redirectPath = null) {
  try {
    const authClient = window.supabase?.auth;
    if (authClient && typeof authClient.signOut === 'function') {
      try {
        await authClient.signOut({ scope: 'global' });
      } catch (err) {
        console.warn('signOut Supabase falhou, continuando limpeza local:', err);
      }
    }
  } catch (err) {
    console.warn('auth signOut catch outer:', err);
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      const removeKeys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) removeKeys.push(key);
      }
      removeKeys.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch (_) {}

  try {
    if (typeof localStorage !== 'undefined') {
      const removeKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('condomit.') ||
          key.startsWith('condominium') ||
          key.startsWith('release_statuses:') ||
          key.startsWith('porteiro:') ||
          key.toLowerCase().includes('condomit') ||
          key.toLowerCase().includes('visitor') ||
          key.toLowerCase().includes('provider-control') ||
          key.toLowerCase().includes('access-log') ||
          key.toLowerCase().includes('release-status')
        )) {
          removeKeys.push(key);
        }
      }
      removeKeys.forEach((k) => localStorage.removeItem(k));
      try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
      try { localStorage.removeItem('sb-localhost-auth-token'); } catch (_) {}
      try { localStorage.removeItem('sb-127.0.0.1-auth-token'); } catch (_) {}
    }
  } catch (_) {}

  try {
    if (typeof document !== 'undefined' && document.cookie) {
      document.cookie.split(';').forEach((c) => {
        const name = c.trim().split('=')[0];
        if (name) {
          const clean = (domain) => {
            try {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; ${domain ? `domain=${domain};` : ''}`;
            } catch (_) {}
          };
          clean('');
          clean(window.location.hostname);
        }
      });
    }
  } catch (_) {}

  const destination = redirectPath || (
    typeof window !== 'undefined' && window.location?.pathname?.includes('/pages/')
      ? '../inicio.html'
      : 'inicio.html'
  );
  try {
    window.location.replace(destination);
  } catch (_) {
    window.location.href = destination;
  }
}

async function listServiceProvidersByCep(cep) {
  const cepClean = String(cep || '').replace(/\D/g, '');
  if (!cepClean) return [];
  try {
    const data = await supabaseFetch(`/service_providers?select=*&cep=eq.${encodeURIComponent(cepClean)}&order=service_date.desc,created_at.desc`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Erro ao listar prestadores por CEP:', error);
    return [];
  }
}

async function createServiceProvider(payload) {
  const cepClean = String(payload?.cep || '').replace(/\D/g, '');
  const normalizedEmail = String(payload?.email || '').trim().toLowerCase();
  if (!cepClean || !normalizedEmail) throw new Error('CEP e e-mail são obrigatórios.');
  const row = {
    email: normalizedEmail,
    cep: cepClean,
    provider_name: String(payload?.provider_name || payload?.name || '').trim(),
    company: String(payload?.company || '').trim(),
    service: String(payload?.service || '').trim(),
    category: String(payload?.category || 'cleaning').trim(),
    phone: String(payload?.phone || '').trim(),
    service_date: String(payload?.service_date || payload?.visitDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
    service_window: String(payload?.service_window || payload?.visitWindow || '--').trim(),
    initial_status: String(payload?.initial_status || payload?.status || 'agendado').trim()
  };
  const validStatuses = ['agendado', 'em andamento', 'concluído', 'cancelado'];
  if (!validStatuses.includes(row.initial_status)) row.initial_status = 'agendado';
  const accessToken = getSupabaseAccessToken();

  try {
    const proxyResponse = await fetch('/api/service_providers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(row)
    });
    const proxyText = await proxyResponse.text();
    let proxyData;
    try { proxyData = proxyText ? JSON.parse(proxyText) : null; } catch (_) { proxyData = proxyText; }
    if (proxyResponse.ok && proxyData) {
      return Array.isArray(proxyData) ? proxyData[0] : proxyData;
    }
  } catch (proxyErr) {
    console.warn('createServiceProvider API proxy falhou, tentando Supabase direto:', proxyErr?.message || proxyErr);
  }

  try {
    const data = await supabaseFetch('/service_providers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    const msg = String(error?.message || error || '');
    if (msg.includes('23505') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
      throw new Error('Já existe um prestador cadastrado com este e-mail.');
    }
    if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
      const fallbackRow = { ...row, created_at: new Date().toISOString() };
      return fallbackRow;
    }
    throw error;
  }
}

async function updateServiceProviderStatus(email, nextStatus) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  const validStatuses = ['agendado', 'em andamento', 'concluído', 'cancelado'];
  const status = validStatuses.includes(String(nextStatus || '').trim()) ? String(nextStatus).trim() : 'agendado';
  try {
    const data = await supabaseFetch(`/service_providers?email=eq.${encodeURIComponent(normalizedEmail)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ initial_status: status })
    });
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (error) {
    console.error('Erro ao atualizar status do prestador:', error);
    return null;
  }
}

async function deleteServiceProvider(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;
  try {
    await supabaseFetch(`/service_providers?email=eq.${encodeURIComponent(normalizedEmail)}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error('Erro ao remover prestador:', error);
    return false;
  }
}

window.listServiceProvidersByCep = listServiceProvidersByCep;
window.createServiceProvider = createServiceProvider;
window.updateServiceProviderStatus = updateServiceProviderStatus;
window.deleteServiceProvider = deleteServiceProvider;
window.performFullLogout = performFullLogout;
window.refreshCurrentUserFromDb = refreshCurrentUserFromDb;
window.getNormalizedUserType = getNormalizedUserType;
window.fetchUserByCpf = fetchUserByCpf;
window.fetchUsersByCpfs = fetchUsersByCpfs;
window.createVisitor = createVisitor;
window.getVisitorsByResponsibleCpf = getVisitorsByResponsibleCpf;
window.getVisitorsForCondominium = getVisitorsForCondominium;
window.getUserCondominiumIdentifiers = getUserCondominiumIdentifiers;

async function saveSuggestion(suggestion) {
  try {
    const data = await supabaseFetch('/suggestions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(suggestion)
    });
    console.log('Sugestão salva com sucesso:', data);
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.error('Erro ao salvar sugestão:', error);
    throw error;
  }
}

async function updateSuggestionStatus(title, newStatus) {
  try {
    const encodedTitle = encodeURIComponent(title);
    const data = await supabaseFetch(`/suggestions?title=eq.${encodedTitle}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: newStatus })
    });
    console.log('Status atualizado com sucesso:', data);
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.error('Erro ao atualizar status da sugestão:', error);
    throw error;
  }
}

async function getSuggestionsByCep(userCep) {
  if (!userCep) return [];
  try {
    const encodedCep = encodeURIComponent(userCep);
    const data = await supabaseFetch(`/suggestions?select=*&cep=eq.${encodedCep}&order=suggestion_date.desc,suggestion_time.desc`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Erro ao buscar sugestões:', error);
    return [];
  }
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

// Sincronização de avatar em todas as páginas
function syncAllAvatars(currentUser) {
  if (!currentUser) return;

  const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const profilePhoto = currentUser.profilePhoto;

  // Sincroniza avatar no topo (em .user-profile-small .avatar)
  const topSmallAvatar = document.querySelector('.user-profile-small .avatar');
  if (topSmallAvatar) {
    topSmallAvatar.style.overflow = 'hidden';
    if (profilePhoto) {
      topSmallAvatar.innerHTML = `<img src="${profilePhoto}" alt="Avatar" />`;
      topSmallAvatar.style.background = 'none';
    } else {
      topSmallAvatar.textContent = initials;
      topSmallAvatar.style.background = '';
    }
  }

  // Sincroniza avatar no topo (configuracoes - #user-avatar-top)
  const topAvatar = document.getElementById('user-avatar-top');
  if (topAvatar) {
    topAvatar.style.overflow = 'hidden';
    if (profilePhoto) {
      topAvatar.innerHTML = `<img src="${profilePhoto}" alt="Avatar" />`;
      topAvatar.style.background = 'none';
    } else {
      topAvatar.textContent = initials;
      topAvatar.style.background = '';
    }
  }

  // Sincroniza avatar em assembleia.js (#user-avatar)
  const assemblyAvatar = document.getElementById('user-avatar');
  if (assemblyAvatar) {
    assemblyAvatar.style.overflow = 'hidden';
    if (profilePhoto) {
      assemblyAvatar.innerHTML = `<img src="${profilePhoto}" alt="Avatar" />`;
      assemblyAvatar.style.background = 'none';
    } else {
      assemblyAvatar.textContent = initials;
      assemblyAvatar.style.background = '';
    }
  }

  // Sincroniza avatar na página de configurações (#profile-avatar-card)
  const configAvatar = document.getElementById('profile-avatar-card');
  if (configAvatar) {
    configAvatar.style.overflow = 'hidden';
    if (profilePhoto) {
      configAvatar.innerHTML = `<img src="${profilePhoto}" alt="Avatar" />`;
      configAvatar.style.background = 'none';
    } else {
      configAvatar.textContent = initials;
      configAvatar.style.background = '';
    }
  }
}

// Event listener para sincronizar avatares quando sessionStorage muda
window.addEventListener('storage', function(e) {
  if (e.key === 'condominiumUser' && e.newValue) {
    const updatedUser = JSON.parse(e.newValue);
    syncAllAvatars(updatedUser);
  }
  
  // Sincroniza tema quando localStorage muda
  if (e.key === 'app-theme' && e.newValue) {
    applyTheme(e.newValue);
  }
  
  // Sincroniza tamanho da fonte quando localStorage muda
  if (e.key === 'app-font-size' && e.newValue) {
    applyFontSize(e.newValue);
  }
  
  // Sincroniza idioma quando localStorage muda
  if (e.key === 'app-language' && e.newValue) {
    if (typeof applyTranslations === 'function') {
      applyTranslations(e.newValue);
    }
  }
});

// Função para aplicar tema em todas as páginas
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);
  updateThemeButtons(theme);
}

// Função para aplicar tamanho de fonte em todas as páginas
function applyFontSize(size) {
  document.documentElement.setAttribute('data-font', size);
  localStorage.setItem('app-font-size', size);
  updateFontButtons(size);
}

// Função para atualizar botões de tema
function updateThemeButtons(theme) {
  const themeBtns = document.querySelectorAll('.theme-btn');
  if (themeBtns.length > 0) {
    themeBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`theme-${theme}`);
    if (activeBtn) activeBtn.classList.add('active');
  }
}

// Função para atualizar botões de fonte
function updateFontButtons(size) {
  const fontBtns = document.querySelectorAll('.font-btn');
  if (fontBtns.length > 0) {
    fontBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`font-${size}`);
    if (activeBtn) activeBtn.classList.add('active');
  }
}

async function fetchApprovedPayment(email) {
  try {
    const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    const payments = await response.json();
    return payments.find(p => p.status_pagamento === 'aprovado');
  } catch (error) {
    console.error('Error checking payment:', error);
    return null;
  }
}

// Função para redirecionar o usuário para sua página inicial correta
async function redirectToHome() {
  const loggedInUser = sessionStorage.getItem('condominiumUser');
  if (!loggedInUser) {
    window.location.href = 'entrar.html';
    return;
  }

  const user = JSON.parse(loggedInUser);
  if (user.type === 'morador') {
    window.location.href = 'index-morador.html';
  } else if (user.type === 'porteiro') {
    window.location.href = 'index-porteiro.html';
  } else if (user.type === 'sindico') {
    // Verificar se o síndico tem pagamento aprovado NO BANCO (não confiar em sessionStorage)
    const approvedPayment = await fetchApprovedPayment(user.email);
    
    if (approvedPayment) {
      // Atualizar o usuário com o plano do pagamento aprovado
      if (approvedPayment.plano_id && !user.plan) {
        user.plan = approvedPayment.plano_id;
        sessionStorage.setItem('condominiumUser', JSON.stringify(user));
      }
      window.location.href = 'index.html';
    } else {
      // Sem pagamento aprovado: força ir para checkout
      delete user.plan;
      sessionStorage.setItem('condominiumUser', JSON.stringify(user));
      window.location.href = 'checkout.html';
    }
  } else {
    // Caso padrão ou outros tipos
    window.location.href = 'index.html';
  }
}

// Inicializa tema ao carregar qualquer página + refresh dos dados do usuário (persistência)
document.addEventListener('DOMContentLoaded', async function() {
  const savedTheme = localStorage.getItem('app-theme') || 'light';
  const savedFontSize = localStorage.getItem('app-font-size') || 'medium';
  
  applyTheme(savedTheme);
  applyFontSize(savedFontSize);

  // Garante que foto de perfil, nome e telefone persistam após logout / refresh
  try {
    const stored = sessionStorage.getItem('condominiumUser');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.email && typeof refreshCurrentUserFromDb === 'function') {
        const refreshed = await refreshCurrentUserFromDb();
        if (refreshed && typeof syncAllAvatars === 'function') {
          syncAllAvatars(refreshed);
        }
      }
    }
  } catch (err) {
    console.warn('Falha ao atualizar perfil durante inicialização:', err);
  }

  // Adiciona evento de clique global para links de "Início"
   document.addEventListener('click', function(e) {
     const navItem = e.target.closest('.nav-item');
     if (navItem) {
       const span = navItem.querySelector('span');
       if (span && span.textContent.trim() === 'Início') {
         e.preventDefault();
         e.stopPropagation();
         redirectToHome();
       }
     }
   }, true); // Usando captura para garantir que o evento seja pego antes de outros listeners
 });

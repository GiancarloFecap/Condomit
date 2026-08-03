const SUPABASE_URL = 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';

const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

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

async function scheduleAssemblyDb(assembly) {
  const data = await supabaseFetch('/scheduled_assemblies', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(assembly)
  });
  return Array.isArray(data) ? data[0] : data;
}

async function getScheduledAssemblies() {
  return await supabaseFetch('/scheduled_assemblies?select=*&order=date.asc,start_time.asc');
}

async function getScheduledAssembliesByCep(userCep) {
  if (!userCep) return [];
  try {
    const encodedCep = encodeURIComponent(userCep);
    const data = await supabaseFetch(`/scheduled_assemblies?select=*&cep=eq.${encodedCep}&order=date.asc,start_time.asc`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Erro ao buscar assembleias agendadas:', error);
    return [];
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

window.refreshCurrentUserFromDb = refreshCurrentUserFromDb;
window.getNormalizedUserType = getNormalizedUserType;

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
    // Caso padrão ou outros tipos (ex: porteiro)
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

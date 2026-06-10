const SUPABASE_URL = 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_REST_URL}${path}`, {
    ...options,
    headers: {
      ...SUPABASE_HEADERS,
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
  const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao buscar usuário');
  }
  const data = await response.json();
  return Array.isArray(data) && data.length ? data[0] : null;
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
    data = text;
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
    data = text;
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
  const data = await supabaseFetch(`/users?select=name,user_type,condominium&user_type=eq.morador&condominium->>cep=eq.${encodeURIComponent(cep)}`);
  return Array.isArray(data) ? data : [];
}

async function scheduleAssemblyDb(assembly) {
  const data = await supabaseFetch('/scheduled_assemblies', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(assembly)
  });
  return Array.isArray(data) ? data[0] : data;
}

async function getScheduledAssemblies() {
  return await supabaseFetch('/scheduled_assemblies?select=*');
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

// Função para redirecionar o usuário para sua página inicial correta
function redirectToHome() {
  const loggedInUser = sessionStorage.getItem('condominiumUser');
  if (!loggedInUser) {
    window.location.href = 'entrar.html';
    return;
  }

  const user = JSON.parse(loggedInUser);
  if (user.type === 'morador') {
    window.location.href = 'index-morador.html';
  } else if (user.type === 'sindico') {
    // Verificar se o síndico tem plano antes de ir para home
    if (!user.plan) {
      window.location.href = 'checkout.html';
      return;
    }
    window.location.href = 'index.html';
  } else {
    // Caso padrão ou outros tipos (ex: porteiro)
    window.location.href = 'index.html';
  }
}

// Inicializa tema ao carregar qualquer página
document.addEventListener('DOMContentLoaded', function() {
  const savedTheme = localStorage.getItem('app-theme') || 'light';
  const savedFontSize = localStorage.getItem('app-font-size') || 'medium';
  
  applyTheme(savedTheme);
  applyFontSize(savedFontSize);

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

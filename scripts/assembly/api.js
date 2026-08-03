(function () {
  function getAccessToken() {
    try {
      const fromSession = sessionStorage.getItem('sb-access-token');
      if (fromSession) return fromSession;
    } catch (e) {
    }
    try {
      const sessionStr = sessionStorage.getItem('sb-session') || localStorage.getItem('sb-session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session && session.access_token) return session.access_token;
      }
    } catch (e) {
    }
    try {
      if (window.supabase && window.supabase.auth && typeof window.supabase.auth.getSession === 'function') {
        return window.supabase.auth.getSession().then(s => s.data && s.data.session && s.data.session.access_token).catch(() => null);
      }
    } catch (e) {
    }
    return null;
  }

  async function resolveToken() {
    const token = getAccessToken();
    if (token && typeof token.then === 'function') {
      try { return await token; } catch (e) { return null; }
    }
    return token;
  }

  function buildHeaders(token) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async function handleResponse(response) {
    let data = null;
    const contentType = response.headers && response.headers.get ? response.headers.get('content-type') : '';
    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch (e) {
      data = null;
    }
    if (!response.ok) {
      const message = (data && (data.message || data.error)) || `Erro ${response.status}: ${response.statusText}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function apiFetch(path, options) {
    options = options || {};
    const token = await resolveToken();
    const fullUrl = path.startsWith('http') ? path : path;
    const config = Object.assign({}, options, {
      headers: Object.assign(buildHeaders(token), options.headers || {})
    });
    try {
      const response = await fetch(fullUrl, config);
      return await handleResponse(response);
    } catch (err) {
      if (window.AssemblyUtils && typeof window.AssemblyUtils.showToast === 'function') {
        window.AssemblyUtils.showToast(err.message || 'Erro na requisição', 'error');
      }
      throw err;
    }
  }

  async function supabaseRpc(fnName, payload) {
    if (window.supabase && typeof window.supabase.rpc === 'function') {
      const { data, error } = await window.supabase.rpc(fnName, payload || {});
      if (error) throw new Error(error.message || `RPC error: ${fnName}`);
      return data;
    }
    return apiFetch(`/api/proxy/${fnName}`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  async function requestLivekitToken(assemblyId) {
    if (!assemblyId) throw new Error('assemblyId é obrigatório');
    try {
      return await apiFetch('/.netlify/functions/livekit-token', {
        method: 'POST',
        body: JSON.stringify({ assembly_id: assemblyId })
      });
    } catch (e) {
      return await supabaseRpc('get_livekit_token', { assembly_id: assemblyId });
    }
  }

  async function requestAssemblyAction(action, payload) {
    if (!action) throw new Error('action é obrigatória');
    try {
      const p = payload || {};
      const body = Object.assign({ action }, p);
      if (body.assemblyId && !body.assembly_id) body.assembly_id = body.assemblyId;
      delete body.assemblyId;
      return await apiFetch('/.netlify/functions/assembly-action', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    } catch (e) {
      return await supabaseRpc('assembly_action', { action, payload: payload || {} });
    }
  }

  async function sendChatMessage(assemblyId, cep, message) {
    if (!assemblyId || !cep || !message) throw new Error('Parâmetros obrigatórios ausentes');
    const sanitized = (window.AssemblyUtils && window.AssemblyUtils.sanitizeMessage)
      ? window.AssemblyUtils.sanitizeMessage(message)
      : String(message).trim();
    if (!sanitized) throw new Error('Mensagem vazia');
    try {
      return await apiFetch('/.netlify/functions/send-chat', {
        method: 'POST',
        body: JSON.stringify({ assemblyId, cep, message: sanitized })
      });
    } catch (e) {
      return await supabaseRpc('send_chat_message', {
        assembly_id: assemblyId,
        cep,
        message: sanitized
      });
    }
  }

  async function votePoll(pollId, optionId, assemblyId, cep) {
    if (!pollId || !optionId || !assemblyId || !cep) throw new Error('Parâmetros obrigatórios ausentes');
    try {
      return await apiFetch('/.netlify/functions/vote-poll', {
        method: 'POST',
        body: JSON.stringify({ pollId, optionId, assemblyId, cep })
      });
    } catch (e) {
      return await supabaseRpc('vote_poll', {
        poll_id: pollId,
        option_id: optionId,
        assembly_id: assemblyId,
        cep
      });
    }
  }

  async function raiseHand(assemblyId, cep) {
    if (!assemblyId || !cep) throw new Error('Parâmetros obrigatórios ausentes');
    try {
      return await apiFetch('/.netlify/functions/raise-hand', {
        method: 'POST',
        body: JSON.stringify({ assemblyId, cep })
      });
    } catch (e) {
      return await supabaseRpc('raise_hand', { assembly_id: assemblyId, cep });
    }
  }

  async function confirmPresence(assemblyId, cep, willAttend) {
    if (!assemblyId || !cep) throw new Error('Parâmetros obrigatórios ausentes');
    willAttend = willAttend !== false;
    try {
      return await apiFetch('/.netlify/functions/confirm-presence', {
        method: 'POST',
        body: JSON.stringify({ assemblyId, cep, willAttend })
      });
    } catch (e) {
      return await supabaseRpc('confirm_presence', {
        assembly_id: assemblyId,
        cep,
        will_attend: willAttend
      });
    }
  }

  async function supabaseSelect(table, options) {
    options = options || {};
    if (window.supabase && typeof window.supabase.from === 'function') {
      let query = window.supabase.from(table).select(options.select || '*');
      if (options.eq) {
        Object.keys(options.eq).forEach(k => {
          query = query.eq(k, options.eq[k]);
        });
      }
      if (options.neq) {
        Object.keys(options.neq).forEach(k => {
          query = query.neq(k, options.neq[k]);
        });
      }
      if (options.gte) {
        Object.keys(options.gte).forEach(k => {
          query = query.gte(k, options.gte[k]);
        });
      }
      if (options.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending !== false });
      }
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.single) {
        query = query.maybeSingle();
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message || `Erro ao consultar ${table}`);
      return data;
    }

    if (typeof window.supabaseFetch !== 'function') {
      throw new Error('Supabase não inicializado');
    }

    const qs = new URLSearchParams();
    qs.set('select', options.select || '*');
    if (options.eq) Object.keys(options.eq).forEach(k => qs.set(`${k}`, `eq.${options.eq[k]}`));
    if (options.neq) Object.keys(options.neq).forEach(k => qs.set(`${k}`, `neq.${options.neq[k]}`));
    if (options.gte) Object.keys(options.gte).forEach(k => qs.set(`${k}`, `gte.${options.gte[k]}`));
    if (options.order) qs.set('order', `${options.order.column}.${options.order.ascending !== false ? 'asc' : 'desc'}`);
    if (options.limit) qs.set('limit', String(options.limit));

    const data = await window.supabaseFetch(`/${table}?${qs.toString()}`);
    if (options.single) return Array.isArray(data) ? (data[0] || null) : data;
    return data;
  }

  async function loadAssemblyList() {
    return await supabaseSelect('scheduled_assemblies', {
      order: { column: 'date', ascending: true }
    });
  }

  async function loadAssemblyDetail(id) {
    if (!id) throw new Error('id é obrigatório');
    const data = await supabaseSelect('scheduled_assemblies', {
      eq: { id },
      single: true
    });
    if (Array.isArray(data)) return data[0] || null;
    return data;
  }

  async function loadMessages(assemblyId) {
    if (!assemblyId) throw new Error('assemblyId é obrigatório');
    return await supabaseSelect('assembly_chat_messages', {
      eq: { assembly_id: assemblyId },
      order: { column: 'created_at', ascending: true }
    });
  }

  async function loadPolls(assemblyId) {
    if (!assemblyId) throw new Error('assemblyId é obrigatório');
    try {
      return await apiFetch(`/.netlify/functions/list-polls?assemblyId=${encodeURIComponent(assemblyId)}`);
    } catch (e) {
      return await supabaseSelect('assembly_polls', {
        eq: { assembly_id: assemblyId },
        order: { column: 'created_at', ascending: true }
      });
    }
  }

  async function loadAgendaItems(assemblyId) {
    if (!assemblyId) throw new Error('assemblyId é obrigatório');
    try {
      return await apiFetch(`/.netlify/functions/list-agenda?assemblyId=${encodeURIComponent(assemblyId)}`);
    } catch (e) {
      return await supabaseSelect('assembly_agenda_items', {
        eq: { assembly_id: assemblyId },
        order: { column: 'order_index', ascending: true }
      });
    }
  }

  async function loadParticipants(assemblyId) {
    if (!assemblyId) throw new Error('assemblyId é obrigatório');
    return await supabaseSelect('assembly_attendance', {
      eq: { assembly_id: assemblyId },
      order: { column: 'joined_at', ascending: true }
    });
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

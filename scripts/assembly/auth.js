(function () {
  function getCurrentUser() {
    let user = null;
    try {
      const sessionStr = sessionStorage.getItem('sb-session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        user = session.user || null;
      }
    } catch (e) {
      user = null;
    }
    if (!user) {
      try {
        const localStr = localStorage.getItem('sb-session');
        if (localStr) {
          const session = JSON.parse(localStr);
          user = session.user || null;
        }
      } catch (e) {
        user = null;
      }
    }
    if (!user) {
      try {
        const userStr = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
        if (userStr) {
          user = JSON.parse(userStr);
        }
      } catch (e) {
        user = null;
      }
    }
    return user;
  }

  async function getUserCep(user) {
    user = user || getCurrentUser();
    if (!user) return null;
    try {
      if (user.condominium) {
        const condo = typeof user.condominium === 'string' ? JSON.parse(user.condominium) : user.condominium;
        if (condo && condo.cep) {
          return (window.AssemblyUtils && window.AssemblyUtils.parseCep) ? window.AssemblyUtils.parseCep(condo.cep) : condo.cep;
        }
      }
    } catch (e) {
    }
    try {
      if (user.app_metadata && user.app_metadata.condominium && user.app_metadata.condominium.cep) {
        const cep = user.app_metadata.condominium.cep;
        return (window.AssemblyUtils && window.AssemblyUtils.parseCep) ? window.AssemblyUtils.parseCep(cep) : cep;
      }
    } catch (e) {
    }
    if (window.supabase) {
      try {
        const { data, error } = await window.supabase
          .from('user_condominiums')
          .select('condominiums(cep)')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!error && data && data.condominiums && data.condominiums.cep) {
          return (window.AssemblyUtils && window.AssemblyUtils.parseCep) ? window.AssemblyUtils.parseCep(data.condominiums.cep) : data.condominiums.cep;
        }
      } catch (e) {
      }
    }
    try {
      const stored = sessionStorage.getItem('user_cep') || localStorage.getItem('user_cep');
      if (stored) return stored;
    } catch (e) {
    }
    return null;
  }

  function isSindico(user) {
    user = user || getCurrentUser();
    if (!user) return false;
    if (user.role === 'sindico' || user.role === 'admin') return true;
    if (user.app_metadata && (user.app_metadata.role === 'sindico' || user.app_metadata.role === 'admin')) return true;
    if (user.user_metadata && (user.user_metadata.role === 'sindico' || user.user_metadata.role === 'admin')) return true;
    if (user.condominium) {
      try {
        const condo = typeof user.condominium === 'string' ? JSON.parse(user.condominium) : user.condominium;
        if (condo && (condo.role === 'sindico' || condo.is_sindico || condo.isAdmin)) return true;
      } catch (e) {
      }
    }
    return false;
  }

  function isOrganizer(user, assembly) {
    user = user || getCurrentUser();
    if (!user || !assembly) return false;
    if (isSindico(user)) return true;
    const createdBy = assembly.created_by || assembly.assembly_created_by || assembly.organizer_id || assembly.owner_id;
    if (createdBy && user.id && String(createdBy) === String(user.id)) return true;
    if (assembly.organizers && Array.isArray(assembly.organizers)) {
      return assembly.organizers.some(o => (typeof o === 'string' ? o : (o.id || o.user_id)) === String(user.id));
    }
    return false;
  }

  async function checkAssemblyAccess(user, assemblyCep) {
    user = user || getCurrentUser();
    if (!user) return { allowed: false, reason: 'not_authenticated' };
    if (!assemblyCep) return { allowed: false, reason: 'invalid_assembly' };
    if (isSindico(user)) return { allowed: true };
    const userCep = await getUserCep(user);
    if (!userCep) return { allowed: false, reason: 'user_cep_not_found' };
    const normalize = (c) => String(c || '').replace(/\D/g, '');
    if (normalize(userCep) === normalize(assemblyCep)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'cep_mismatch', userCep, assemblyCep };
  }

  window.AssemblyAuth = {
    getCurrentUser,
    getUserCep,
    isSindico,
    isOrganizer,
    checkAssemblyAccess
  };
})();

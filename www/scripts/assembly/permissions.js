(function () {
  function resolveUser(user) {
    if (user) return user;
    if (window.AssemblyAuth && typeof window.AssemblyAuth.getCurrentUser === 'function') {
      return window.AssemblyAuth.getCurrentUser();
    }
    return null;
  }

  function isOrganizer(user, assembly) {
    if (window.AssemblyAuth && typeof window.AssemblyAuth.isOrganizer === 'function') {
      return window.AssemblyAuth.isOrganizer(user, assembly);
    }
    if (!user || !assembly) return false;
    const createdBy = assembly.created_by || assembly.assembly_created_by || assembly.organizer_id || assembly.owner_id;
    if (createdBy && user.id && String(createdBy) === String(user.id)) return true;
    if (assembly.organizers && Array.isArray(assembly.organizers)) {
      return assembly.organizers.some(o => (typeof o === 'string' ? o : (o.id || o.user_id)) === String(user.id));
    }
    return false;
  }

  function isSindico(user) {
    if (window.AssemblyAuth && typeof window.AssemblyAuth.isSindico === 'function') {
      return window.AssemblyAuth.isSindico(user);
    }
    if (!user) return false;
    if (user.role === 'sindico' || user.role === 'admin') return true;
    if (user.app_metadata && (user.app_metadata.role === 'sindico' || user.app_metadata.role === 'admin')) return true;
    if (user.user_metadata && (user.user_metadata.role === 'sindico' || user.user_metadata.role === 'admin')) return true;
    return false;
  }

  function isPrivileged(user, assembly) {
    return isSindico(user) || isOrganizer(user, assembly);
  }

  function isAssemblyActive(assembly) {
    if (!assembly) return false;
    return assembly.status === 'live' || assembly.status === 'active' || assembly.status === 'in_progress';
  }

  function canCreateAssembly(user) {
    user = resolveUser(user);
    return isSindico(user);
  }

  function canEditAssembly(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (isPrivileged(user, assembly)) return true;
    return false;
  }

  function canDeleteAssembly(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (isSindico(user)) return true;
    return isOrganizer(user, assembly);
  }

  function canStartAssembly(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (!isPrivileged(user, assembly)) return false;
    if (isAssemblyActive(assembly)) return false;
    return true;
  }

  function canEndAssembly(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (!isPrivileged(user, assembly)) return false;
    if (!isAssemblyActive(assembly)) return false;
    return true;
  }

  function canManagePolls(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    return isPrivileged(user, assembly);
  }

  function canManageAgenda(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    return isPrivileged(user, assembly);
  }

  function canSendMessages(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (!isAssemblyActive(assembly)) {
      if (assembly && assembly.allow_chat_before === false) return false;
    }
    if (assembly && assembly.chat_muted === true) {
      if (isPrivileged(user, assembly)) return true;
      return false;
    }
    return true;
  }

  function canVote(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (!isAssemblyActive(assembly)) return false;
    if (assembly && assembly.allow_voting === false) return false;
    return true;
  }

  function canScreenShare(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (!isAssemblyActive(assembly)) return false;
    if (isPrivileged(user, assembly)) return true;
    if (assembly && assembly.allow_screen_share === true) return true;
    return false;
  }

  function canRecord(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    return isPrivileged(user, assembly);
  }

  function canRemoveParticipant(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    return isPrivileged(user, assembly);
  }

  function canRaiseHand(user, assembly) {
    user = resolveUser(user);
    if (!user || !assembly) return false;
    if (!isAssemblyActive(assembly)) return false;
    if (assembly && assembly.allow_raise_hand === false) return false;
    return true;
  }

  window.AssemblyPermissions = {
    canCreateAssembly,
    canEditAssembly,
    canDeleteAssembly,
    canStartAssembly,
    canEndAssembly,
    canManagePolls,
    canManageAgenda,
    canSendMessages,
    canVote,
    canScreenShare,
    canRecord,
    canRemoveParticipant,
    canRaiseHand
  };
})();

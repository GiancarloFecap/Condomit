async function fetchUserByCpf(cpf) {
  const normalizedCpf = String(cpf || '').replace(/\D/g, '');

  if (normalizedCpf.length !== 11) {
    return null;
  }

  try {
    const rows = await supabaseFetch(
      '/rpc/condomit_find_responsible_by_cpf',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_cpf: normalizedCpf
        })
      }
    );

    const user = Array.isArray(rows)
      ? rows[0] || null
      : rows || null;

    return user;
  } catch (error) {
    console.error(
      'Erro ao buscar responsável por CPF:',
      error
    );

    return null;
  }
}

async function createVisitor(visitor) {
  const accessToken = await resolveSupabaseAccessToken();

  if (!accessToken) {
    throw new Error(
      'Sua sessão expirou. Saia da conta, entre novamente e tente cadastrar o visitante.'
    );
  }

  const currentUser = getStoredCurrentUser();

  if (!currentUser) {
    throw new Error(
      'Não foi possível identificar o usuário conectado.'
    );
  }

  const cep = await resolveUserCondominiumCep(currentUser);

  if (!cep) {
    throw new Error(
      'Não foi possível identificar o CEP do condomínio do usuário.'
    );
  }

  const visitorCpf = String(visitor?.cpf || '').replace(/\D/g, '');
  const typedResponsibleCpf = String(visitor?.responsible_cpf || '').replace(/\D/g, '');
  const fullName = String(visitor?.full_name || '').trim();
  const rg = String(visitor?.rg || '').trim();

  if (visitorCpf.length !== 11) {
    throw new Error('Informe um CPF válido para o visitante.');
  }

  if (!fullName) {
    throw new Error('Informe o nome completo do visitante.');
  }

  if (!rg) {
    throw new Error('Informe o RG do visitante.');
  }

  if (typedResponsibleCpf.length !== 11) {
    throw new Error('Informe um CPF válido para o responsável.');
  }

  /*
   * IMPORTANTE:
   * visitors.responsible_cpf possui FK para users.cpf.
   * Por isso precisamos usar o CPF EXATAMENTE como está salvo
   * em public.users (com ou sem máscara), e não forçar apenas dígitos.
   */
  const responsibleUser = await fetchUserByCpf(typedResponsibleCpf);

  if (!responsibleUser?.cpf) {
    throw new Error(
      'CPF do responsável não encontrado neste condomínio.'
    );
  }

  const payload = {
    cep,
    cpf: visitorCpf,
    full_name: fullName,
    rg,
    phone: String(visitor?.phone || '').trim() || null,
    email: String(visitor?.email || '').trim().toLowerCase() || null,
    responsible_cpf: String(responsibleUser.cpf).trim()
  };

  try {
    const data = await supabaseFetch(
      '/visitors',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(payload)
      }
    );

    const savedVisitor = Array.isArray(data)
      ? data[0] || null
      : data || null;

    if (!savedVisitor) {
      throw new Error(
        'O Supabase não confirmou o cadastro do visitante.'
      );
    }

    return savedVisitor;
  } catch (error) {
    const message = String(error?.message || error || '');

    if (
      message.includes('visitors_responsible_cpf_fkey') ||
      message.toLowerCase().includes('foreign key')
    ) {
      throw new Error(
        'O CPF do responsável não corresponde a um usuário cadastrado. Atualize a página e tente novamente.'
      );
    }

    if (
      message.includes('duplicate key') ||
      message.includes('23505')
    ) {
      throw new Error(
        'Já existe um visitante cadastrado com este CPF.'
      );
    }

    throw error;
  }
}

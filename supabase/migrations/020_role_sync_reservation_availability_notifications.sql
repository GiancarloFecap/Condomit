-- ============================================================
-- CONDOMIT - MIGRAÇÃO 020
-- Sincronização de cargo, disponibilidade de reservas e notificações
-- direcionadas (chat, visitantes, encomendas e prestadores).
-- Requer as migrations anteriores, especialmente 012-019.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. NOTIFICAÇÕES DIRECIONADAS POR USUÁRIO
-- ------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS event_key TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_email, created_at DESC);

-- UNIQUE permite vários NULLs e evita notificações duplicadas de um mesmo evento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_key_unique
  ON public.notifications (event_key);

-- Amplia as categorias para os novos eventos operacionais.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_check
  CHECK (category IN (
    'Avisos',
    'Reservas',
    'Assembleias',
    'Entregas',
    'Chat',
    'Visitantes',
    'Prestadores'
  ));

-- A central mostra:
--   a) notificações gerais do condomínio (recipient_email IS NULL); ou
--   b) notificações destinadas especificamente à conta logada.
CREATE OR REPLACE FUNCTION public.condomit_list_notifications()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(n)
  FROM public.notifications n
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_same_cep(n.cep, public.condomit_current_user_cep())
    AND (
      n.recipient_email IS NULL
      OR LOWER(COALESCE(n.recipient_email, '')) = public.condomit_auth_email()
    )
  ORDER BY n.created_at DESC, n.id DESC;
$$;

-- Protege também consultas diretas à tabela para uma notificação direcionada
-- não aparecer para outra pessoa do mesmo condomínio.
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
CREATE POLICY notifications_select_policy
ON public.notifications
FOR SELECT TO authenticated
USING (
  public.condomit_auth_email() <> ''
  AND public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND (
    recipient_email IS NULL
    OR LOWER(COALESCE(recipient_email, '')) = public.condomit_auth_email()
  )
);

-- ------------------------------------------------------------
-- 2. HELPER: NOTIFICAR PORTEIROS DO MESMO CONDOMÍNIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_notify_porters(
  target_cep TEXT,
  actor_email TEXT,
  actor_name TEXT,
  target_category TEXT,
  target_title TEXT,
  target_description TEXT,
  target_event_type TEXT,
  target_event_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(TRIM(COALESCE(target_cep, '')), '') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    cep,
    category,
    title,
    description,
    created_by,
    created_by_name,
    event_type,
    recipient_email,
    event_key,
    created_at
  )
  SELECT
    target_cep,
    target_category,
    target_title,
    target_description,
    NULLIF(LOWER(TRIM(COALESCE(actor_email, ''))), ''),
    COALESCE(NULLIF(TRIM(COALESCE(actor_name, '')), ''), 'Usuário'),
    target_event_type,
    LOWER(p.email),
    target_event_key || ':' || LOWER(p.email),
    NOW()
  FROM public.users p
  WHERE LOWER(COALESCE(p.user_type, '')) = 'porteiro'
    AND public.condomit_email_belongs_to_cep(p.email, target_cep)
    AND LOWER(COALESCE(p.email, '')) <> LOWER(COALESCE(actor_email, ''))
  ON CONFLICT (event_key) DO NOTHING;
END;
$$;

-- ------------------------------------------------------------
-- 3. NOVO VISITANTE -> NOTIFICA PORTEIROS (EXCETO QUEM CADASTROU)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_notify_new_visitor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_email TEXT := public.condomit_auth_email();
  actor_name TEXT;
  visitor_name TEXT := COALESCE(NULLIF(TRIM(NEW.full_name), ''), 'Visitante');
BEGIN
  IF actor_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO actor_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = actor_email
  LIMIT 1;

  PERFORM public.condomit_notify_porters(
    NEW.cep,
    actor_email,
    COALESCE(actor_name, actor_email),
    'Visitantes',
    'Novo visitante cadastrado',
    COALESCE(actor_name, actor_email) || ' cadastrou o visitante ' || visitor_name || '.',
    'visitor_created',
    'visitor_created:' || REGEXP_REPLACE(COALESCE(NEW.cpf, ''), '\D', '', 'g') || ':' || COALESCE(NEW.created_at, NOW())::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condomit_notify_new_visitor ON public.visitors;
CREATE TRIGGER trg_condomit_notify_new_visitor
AFTER INSERT ON public.visitors
FOR EACH ROW
EXECUTE FUNCTION public.condomit_notify_new_visitor();

-- ------------------------------------------------------------
-- 4. NOVA ENCOMENDA -> NOTIFICA PORTEIROS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_notify_new_package()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_email TEXT := public.condomit_auth_email();
  actor_name TEXT;
  arrival_text TEXT := '';
BEGIN
  IF actor_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO actor_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = actor_email
  LIMIT 1;

  IF NEW.expected_arrival_date IS NOT NULL THEN
    arrival_text := ' Previsão: ' || TO_CHAR(NEW.expected_arrival_date, 'DD/MM/YYYY');
    IF NEW.expected_arrival_time IS NOT NULL THEN
      arrival_text := arrival_text || ' às ' || TO_CHAR(NEW.expected_arrival_time, 'HH24:MI');
    END IF;
    arrival_text := arrival_text || '.';
  END IF;

  PERFORM public.condomit_notify_porters(
    NEW.cep,
    actor_email,
    COALESCE(actor_name, actor_email),
    'Entregas',
    'Nova encomenda registrada',
    COALESCE(actor_name, actor_email) || ' registrou uma encomenda para ' || COALESCE(NULLIF(TRIM(NEW.recipient_name), ''), NEW.recipient_email) || '.' || arrival_text,
    'package_created',
    'package_created:' || NEW.id::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condomit_notify_new_package ON public.packages;
CREATE TRIGGER trg_condomit_notify_new_package
AFTER INSERT ON public.packages
FOR EACH ROW
EXECUTE FUNCTION public.condomit_notify_new_package();

-- ------------------------------------------------------------
-- 5. NOVO PRESTADOR -> NOTIFICA PORTEIROS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_notify_new_service_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_email TEXT := public.condomit_auth_email();
  actor_name TEXT;
BEGIN
  IF actor_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO actor_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = actor_email
  LIMIT 1;

  PERFORM public.condomit_notify_porters(
    NEW.cep,
    actor_email,
    COALESCE(actor_name, actor_email),
    'Prestadores',
    'Novo prestador cadastrado',
    COALESCE(actor_name, actor_email) || ' cadastrou o prestador ' || COALESCE(NULLIF(TRIM(NEW.provider_name), ''), NEW.email) || ' para o serviço de ' || COALESCE(NULLIF(TRIM(NEW.service), ''), 'serviço não informado') || '.',
    'service_provider_created',
    'service_provider_created:' || LOWER(COALESCE(NEW.email, '')) || ':' || COALESCE(NEW.created_at, NOW())::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condomit_notify_new_service_provider ON public.service_providers;
CREATE TRIGGER trg_condomit_notify_new_service_provider
AFTER INSERT ON public.service_providers
FOR EACH ROW
EXECUTE FUNCTION public.condomit_notify_new_service_provider();

-- ------------------------------------------------------------
-- 6. CHAT -> NOTIFICA SOMENTE O DESTINATÁRIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_notify_chat_recipient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sender_name TEXT;
  preview TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO sender_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(NEW.sender_email, ''))
  LIMIT 1;

  sender_name := COALESCE(sender_name, NEW.sender_email, 'Usuário');
  preview := NULLIF(TRIM(COALESCE(NEW.message, '')), '');

  IF preview IS NULL AND NULLIF(TRIM(COALESCE(NEW.attachment_name, '')), '') IS NOT NULL THEN
    preview := 'Arquivo enviado: ' || NEW.attachment_name;
  ELSIF preview IS NULL THEN
    preview := 'Nova mensagem recebida.';
  END IF;

  INSERT INTO public.notifications (
    cep,
    category,
    title,
    description,
    created_by,
    created_by_name,
    event_type,
    recipient_email,
    event_key,
    created_at
  ) VALUES (
    NEW.cep,
    'Chat',
    'Nova mensagem de ' || sender_name,
    sender_name || ': ' || LEFT(preview, 220),
    NEW.sender_email,
    sender_name,
    'chat_message_received',
    LOWER(NEW.recipient_email),
    'chat_message:' || NEW.id::TEXT || ':' || LOWER(NEW.recipient_email),
    NEW.created_at
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condomit_notify_chat_recipient ON public.condominium_chat_messages;
CREATE TRIGGER trg_condomit_notify_chat_recipient
AFTER INSERT ON public.condominium_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.condomit_notify_chat_recipient();

-- ------------------------------------------------------------
-- 7. PORTEIRO LIBERA VISITANTE -> NOTIFICA O RESPONSÁVEL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_notify_visitor_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_email TEXT;
  actor_name TEXT;
  actor_role TEXT;
  responsible_email TEXT;
  responsible_name TEXT;
  visitor_name TEXT := COALESCE(NULLIF(TRIM(NEW.full_name), ''), 'Seu visitante');
BEGIN
  IF LOWER(COALESCE(NEW.release_status, '')) <> 'liberado'
     OR LOWER(COALESCE(OLD.release_status, '')) = 'liberado' THEN
    RETURN NEW;
  END IF;

  actor_email := LOWER(COALESCE(NULLIF(TRIM(NEW.release_status_updated_by), ''), public.condomit_auth_email()));

  SELECT
    LOWER(COALESCE(u.user_type, '')),
    COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO actor_role, actor_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = actor_email
  LIMIT 1;

  -- O aviso solicitado é específico para liberações feitas pela portaria.
  IF COALESCE(actor_role, '') <> 'porteiro' THEN
    RETURN NEW;
  END IF;

  SELECT
    LOWER(u.email),
    COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO responsible_email, responsible_name
  FROM public.users u
  WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(NEW.responsible_cpf, ''), '\D', '', 'g')
    AND public.condomit_email_belongs_to_cep(u.email, NEW.cep)
  LIMIT 1;

  IF responsible_email IS NULL OR responsible_email = actor_email THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    cep,
    category,
    title,
    description,
    created_by,
    created_by_name,
    event_type,
    recipient_email,
    event_key,
    created_at
  ) VALUES (
    NEW.cep,
    'Visitantes',
    'Visitante liberado',
    visitor_name || ' foi liberado pela portaria' || CASE WHEN actor_name IS NOT NULL THEN ' por ' || actor_name ELSE '' END || '.',
    actor_email,
    COALESCE(actor_name, actor_email, 'Portaria'),
    'visitor_released',
    responsible_email,
    'visitor_released:' || REGEXP_REPLACE(COALESCE(NEW.cpf, ''), '\D', '', 'g') || ':' || COALESCE(NEW.release_status_updated_at, NOW())::TEXT || ':' || responsible_email,
    COALESCE(NEW.release_status_updated_at, NOW())
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condomit_notify_visitor_release ON public.visitors;
CREATE TRIGGER trg_condomit_notify_visitor_release
AFTER UPDATE OF release_status ON public.visitors
FOR EACH ROW
EXECUTE FUNCTION public.condomit_notify_visitor_release();

-- ------------------------------------------------------------
-- 8. RESERVAS: DISPONIBILIDADE REAL DO CONDOMÍNIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_list_reservation_slots()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'email', r.email,
    'nome_local', r.nome_local,
    'data_reserva', r.data_reserva,
    'horario_inicio', r.horario_inicio,
    'horario_fim', r.horario_fim,
    'status', r.status
  )
  FROM public.reserva r
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_email_belongs_to_cep(
      r.email,
      public.condomit_current_user_cep()
    )
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
$$;

CREATE OR REPLACE FUNCTION public.condomit_list_all_reservations()
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF public.condomit_auth_email() = '' OR caller_cep IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    to_jsonb(r)
    || jsonb_build_object(
      'reserved_by_name', COALESCE(NULLIF(u.name, ''), r.email)
    )
  FROM public.reserva r
  LEFT JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(r.email, ''))
  WHERE public.condomit_email_belongs_to_cep(r.email, caller_cep)
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
END;
$$;

-- O projeto antigo possuía uma constraint chamada reserva_unica que podia
-- devolver a mensagem técnica "duplicate key value...". A proteção de
-- concorrência abaixo é por condomínio/local/data e substitui essa UX ruim.
ALTER TABLE public.reserva
  DROP CONSTRAINT IF EXISTS reserva_unica;

CREATE OR REPLACE FUNCTION public.condomit_create_reservation(
  target_local TEXT,
  target_date TEXT,
  target_start TEXT,
  target_end TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
  saved_row public.reserva%ROWTYPE;
  start_time TIME;
  end_time TIME;
  lock_key BIGINT;
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(target_local, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Local da reserva é obrigatório.' USING ERRCODE = '23502';
  END IF;

  start_time := target_start::TIME;
  end_time := target_end::TIME;

  IF end_time <= start_time THEN
    RAISE EXCEPTION 'Horário final deve ser posterior ao horário inicial.' USING ERRCODE = '22023';
  END IF;

  lock_key := hashtextextended(
    LOWER(caller_cep || '|' || TRIM(target_local) || '|' || target_date),
    0
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.reserva r
    WHERE public.condomit_email_belongs_to_cep(r.email, caller_cep)
      AND LOWER(COALESCE(r.nome_local, '')) = LOWER(TRIM(target_local))
      AND r.data_reserva = target_date::DATE
      AND r.horario_inicio < end_time
      AND r.horario_fim > start_time
  ) THEN
    RAISE EXCEPTION 'Horário indisponível! Escolha outro horário.' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.reserva (
      email, nome_local, data_reserva, horario_inicio, horario_fim, status
    ) VALUES (
      caller_email,
      TRIM(target_local),
      target_date::DATE,
      start_time,
      end_time,
      'indisponivel'
    )
    RETURNING * INTO saved_row;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Horário indisponível! Escolha outro horário.' USING ERRCODE = 'P0001';
  END;

  RETURN to_jsonb(saved_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.condomit_list_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_reservation_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_all_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_create_reservation(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Helpers/triggers não precisam ser executados pelo navegador.
REVOKE ALL ON FUNCTION public.condomit_notify_porters(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_notify_new_visitor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_notify_new_package() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_notify_new_service_provider() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_notify_chat_recipient() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_notify_visitor_release() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;

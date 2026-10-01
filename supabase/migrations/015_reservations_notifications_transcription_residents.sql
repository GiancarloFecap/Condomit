-- ============================================================
-- MIGRAÇÃO 015 - RESERVAS, NOTIFICAÇÕES, TRANSCRIÇÃO E MORADORES
-- Condomit
-- Requer as migrations 012, 013 e 014 aplicadas anteriormente.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. NOTIFICAÇÕES PERSISTIDAS NO BANCO
-- ------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_cep_created_at
  ON public.notifications (cep, created_at DESC);

CREATE OR REPLACE FUNCTION public.condomit_create_notification(
  target_category TEXT,
  target_title TEXT,
  target_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  caller_cep TEXT := public.condomit_current_user_cep();
  caller_name TEXT;
  saved_row public.notifications%ROWTYPE;
  normalized_category TEXT := TRIM(COALESCE(target_category, 'Avisos'));
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  IF caller_role NOT IN ('sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode publicar notificações.' USING ERRCODE = '42501';
  END IF;

  IF normalized_category NOT IN ('Avisos', 'Reservas', 'Assembleias', 'Entregas') THEN
    RAISE EXCEPTION 'Categoria de notificação inválida.' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(TRIM(COALESCE(target_title, '')), '') IS NULL
     OR NULLIF(TRIM(COALESCE(target_description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Título e descrição são obrigatórios.' USING ERRCODE = '23502';
  END IF;

  SELECT COALESCE(NULLIF(u.name, ''), u.email)
  INTO caller_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  INSERT INTO public.notifications (
    cep, category, title, description, created_by, created_by_name
  ) VALUES (
    caller_cep,
    normalized_category,
    TRIM(target_title),
    TRIM(target_description),
    caller_email,
    COALESCE(caller_name, caller_email)
  )
  RETURNING * INTO saved_row;

  RETURN to_jsonb(saved_row);
END;
$$;

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
  ORDER BY n.created_at DESC;
$$;

-- ------------------------------------------------------------
-- 2. RESERVAS DO CONDOMÍNIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_list_my_reservations()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(r)
  FROM public.reserva r
  WHERE public.condomit_auth_email() <> ''
    AND LOWER(COALESCE(r.email, '')) = public.condomit_auth_email()
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
$$;

CREATE OR REPLACE FUNCTION public.condomit_list_reservation_slots()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'nome_local', r.nome_local,
    'data_reserva', r.data_reserva,
    'horario_inicio', r.horario_inicio,
    'horario_fim', r.horario_fim,
    'status', r.status
  )
  FROM public.reserva r
  WHERE public.condomit_auth_email() <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_condominiums uc
      WHERE LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
        AND public.condomit_same_cep(uc.condominium_id::TEXT, public.condomit_current_user_cep())
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
  caller_role TEXT := public.condomit_current_user_role();
BEGIN
  IF public.condomit_auth_email() = '' OR caller_cep IS NULL THEN
    RETURN;
  END IF;

  IF caller_role NOT IN ('sindico', 'síndico', 'porteiro', 'admin') THEN
    RAISE EXCEPTION 'Usuário sem permissão para visualizar todas as reservas.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(r)
  FROM public.reserva r
  WHERE EXISTS (
    SELECT 1
    FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
      AND public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
  )
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
END;
$$;

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
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(target_local, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Local da reserva é obrigatório.' USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reserva r
    JOIN public.user_condominiums uc
      ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
    WHERE public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
      AND LOWER(COALESCE(r.nome_local, '')) = LOWER(TRIM(target_local))
      AND r.data_reserva::TEXT = target_date
      AND LEFT(r.horario_inicio::TEXT, 5) = LEFT(target_start, 5)
      AND LEFT(r.horario_fim::TEXT, 5) = LEFT(target_end, 5)
      AND LOWER(COALESCE(r.status, '')) = 'indisponivel'
  ) THEN
    RAISE EXCEPTION 'Este horário já foi reservado.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.reserva (
    email, nome_local, data_reserva, horario_inicio, horario_fim, status
  ) VALUES (
    caller_email,
    TRIM(target_local),
    target_date::DATE,
    target_start::TIME,
    target_end::TIME,
    'indisponivel'
  )
  RETURNING * INTO saved_row;

  RETURN to_jsonb(saved_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_delete_my_reservation(
  target_local TEXT,
  target_date TEXT,
  target_start TEXT,
  target_end TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  deleted_count INTEGER;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.reserva r
  WHERE LOWER(COALESCE(r.email, '')) = caller_email
    AND LOWER(COALESCE(r.nome_local, '')) = LOWER(TRIM(COALESCE(target_local, '')))
    AND r.data_reserva::TEXT = target_date
    AND LEFT(r.horario_inicio::TEXT, 5) = LEFT(target_start, 5)
    AND LEFT(r.horario_fim::TEXT, 5) = LEFT(target_end, 5);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;

-- ------------------------------------------------------------
-- 3. VISITANTES LIBERADOS PELO PORTEIRO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_list_released_visitors_by_porter()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    to_jsonb(v)
    || jsonb_build_object(
      'responsible',
      CASE
        WHEN responsible.email IS NULL THEN NULL
        ELSE jsonb_build_object(
          'cpf', responsible.cpf,
          'name', responsible.name,
          'phone', responsible.phone,
          'email', responsible.email,
          'condominium',
            COALESCE(responsible.condominium, '{}'::jsonb)
            || jsonb_build_object(
              'cep', v.cep,
              'condominium_id', v.cep,
              'apartment', COALESCE(uc.apartment::TEXT, ''),
              'block', COALESCE(uc.block::TEXT, '')
            )
        )
      END
    )
  FROM public.visitors v
  JOIN public.users updater
    ON LOWER(COALESCE(updater.email, '')) = LOWER(COALESCE(v.release_status_updated_by, ''))
   AND LOWER(COALESCE(updater.user_type, '')) = 'porteiro'
  LEFT JOIN public.users responsible
    ON REGEXP_REPLACE(COALESCE(responsible.cpf, ''), '\D', '', 'g')
     = REGEXP_REPLACE(COALESCE(v.responsible_cpf, ''), '\D', '', 'g')
  LEFT JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(responsible.email, ''))
   AND public.condomit_same_cep(uc.condominium_id::TEXT, v.cep)
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_same_cep(v.cep, public.condomit_current_user_cep())
    AND LOWER(COALESCE(v.release_status, '')) = 'liberado'
  ORDER BY COALESCE(v.release_status_updated_at, v.created_at) DESC;
$$;

-- ------------------------------------------------------------
-- 4. GESTÃO DE MORADORES: PROMOVER E EXPULSAR
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_promote_resident_to_sindico(target_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  caller_cep TEXT := public.condomit_current_user_cep();
  resident_email TEXT;
BEGIN
  IF caller_email = '' OR caller_cep IS NULL OR caller_role NOT IN ('sindico', 'síndico') THEN
    RAISE EXCEPTION 'Apenas o síndico atual pode transferir a função.' USING ERRCODE = '42501';
  END IF;

  SELECT u.email
  INTO resident_email
  FROM public.users u
  JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
  WHERE LOWER(COALESCE(u.email, '')) = LOWER(TRIM(COALESCE(target_email, '')))
    AND LOWER(COALESCE(u.user_type, '')) = 'morador'
    AND public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
  LIMIT 1;

  IF resident_email IS NULL THEN
    RAISE EXCEPTION 'Morador não encontrado neste condomínio.' USING ERRCODE = 'P0002';
  END IF;

  IF LOWER(resident_email) = caller_email THEN
    RAISE EXCEPTION 'Não é possível promover a própria conta.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
  SET user_type = 'morador'
  WHERE LOWER(COALESCE(email, '')) = caller_email;

  UPDATE public.users
  SET user_type = 'sindico'
  WHERE LOWER(COALESCE(email, '')) = LOWER(resident_email);

  RETURN jsonb_build_object(
    'changed', TRUE,
    'old_sindico_email', caller_email,
    'new_sindico_email', resident_email,
    'cep', caller_cep
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_expulse_resident(target_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  caller_cep TEXT := public.condomit_current_user_cep();
  resident_email TEXT;
BEGIN
  IF caller_email = '' OR caller_cep IS NULL OR caller_role NOT IN ('sindico', 'síndico') THEN
    RAISE EXCEPTION 'Apenas o síndico pode remover moradores.' USING ERRCODE = '42501';
  END IF;

  SELECT u.email
  INTO resident_email
  FROM public.users u
  JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
  WHERE LOWER(COALESCE(u.email, '')) = LOWER(TRIM(COALESCE(target_email, '')))
    AND LOWER(COALESCE(u.user_type, '')) = 'morador'
    AND public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
  LIMIT 1;

  IF resident_email IS NULL THEN
    RAISE EXCEPTION 'Morador não encontrado neste condomínio.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.dependents
  WHERE LOWER(COALESCE(responsible_email, '')) = LOWER(resident_email)
    AND public.condomit_same_cep(cep, caller_cep);

  DELETE FROM public.vehicles
  WHERE LOWER(COALESCE(responsible_email, '')) = LOWER(resident_email)
    AND public.condomit_same_cep(cep, caller_cep);

  DELETE FROM public.user_condominiums
  WHERE LOWER(COALESCE(user_email, '')) = LOWER(resident_email)
    AND public.condomit_same_cep(condominium_id::TEXT, caller_cep);

  UPDATE public.users
  SET condominium = '{}'::jsonb
  WHERE LOWER(COALESCE(email, '')) = LOWER(resident_email);

  RETURN jsonb_build_object(
    'changed', TRUE,
    'email', resident_email,
    'removed_from_cep', caller_cep
  );
END;
$$;

-- ------------------------------------------------------------
-- 5. TRANSCRIÇÃO AUTOMÁTICA DA ASSEMBLEIA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assembly_transcripts (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assembly_id BIGINT NOT NULL REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  participant_email TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  participant_role TEXT,
  participant_identity TEXT,
  transcript TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web_speech',
  spoken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assembly_transcripts_text_check CHECK (CHAR_LENGTH(TRIM(transcript)) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS idx_assembly_transcripts_assembly_time
  ON public.assembly_transcripts (assembly_id, spoken_at ASC);

ALTER TABLE public.assembly_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_transcripts_select_policy ON public.assembly_transcripts;
CREATE POLICY assembly_transcripts_select_policy
ON public.assembly_transcripts
FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(cep));

-- Inserts são feitos pela RPC SECURITY DEFINER abaixo.
DROP POLICY IF EXISTS assembly_transcripts_insert_policy ON public.assembly_transcripts;

CREATE OR REPLACE FUNCTION public.condomit_append_assembly_transcript(
  target_assembly_id BIGINT,
  transcript_text TEXT,
  participant_identity_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_name TEXT;
  caller_role TEXT;
  assembly_row public.scheduled_assemblies%ROWTYPE;
  saved_row public.assembly_transcripts%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(transcript_text, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Transcrição vazia.' USING ERRCODE = '22023';
  END IF;

  SELECT sa.* INTO assembly_row
  FROM public.scheduled_assemblies sa
  WHERE sa.id = target_assembly_id
  LIMIT 1;

  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(assembly_row.cep) THEN
    RAISE EXCEPTION 'Assembleia não encontrada neste condomínio.' USING ERRCODE = '42501';
  END IF;

  IF LOWER(COALESCE(assembly_row.status, '')) NOT IN ('agendada', 'em_andamento') THEN
    RAISE EXCEPTION 'A assembleia não está disponível para transcrição.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(u.name, ''), u.email), LOWER(COALESCE(u.user_type, 'morador'))
  INTO caller_name, caller_role
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  INSERT INTO public.assembly_transcripts (
    assembly_id, cep, participant_email, participant_name, participant_role,
    participant_identity, transcript, source, spoken_at
  ) VALUES (
    assembly_row.id,
    assembly_row.cep,
    caller_email,
    COALESCE(caller_name, caller_email),
    COALESCE(caller_role, 'morador'),
    NULLIF(TRIM(COALESCE(participant_identity_value, '')), ''),
    TRIM(transcript_text),
    'web_speech',
    NOW()
  )
  RETURNING * INTO saved_row;

  RETURN to_jsonb(saved_row);
END;
$$;

-- ------------------------------------------------------------
-- 6. VOTO PÓS-ASSEMBLEIA NA ATA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_assembly_poll_results(
  target_assembly_id BIGINT
)
RETURNS TABLE (
  poll_id BIGINT,
  option_id BIGINT,
  vote_count BIGINT,
  current_user_voted BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ap.id AS poll_id,
    apo.id AS option_id,
    (
      SELECT COUNT(*)::BIGINT
      FROM public.assembly_votes av
      WHERE av.poll_id = ap.id
        AND av.option_id = apo.id
    ) AS vote_count,
    EXISTS (
      SELECT 1
      FROM public.assembly_votes mine
      WHERE mine.poll_id = ap.id
        AND LOWER(COALESCE(mine.user_email, '')) = public.condomit_auth_email()
    ) AS current_user_voted
  FROM public.assembly_polls ap
  JOIN public.assembly_poll_options apo ON apo.poll_id = ap.id
  JOIN public.scheduled_assemblies sa ON sa.id = ap.assembly_id
  WHERE ap.assembly_id = target_assembly_id
    AND public.condomit_user_belongs_to_cep(sa.cep)
    AND (
      LOWER(COALESCE(sa.status, '')) = 'encerrada'
      OR COALESCE(ap.show_results_immediately, FALSE) = TRUE
      OR LOWER(COALESCE(ap.status, '')) = 'encerrada'
      OR (ap.end_at IS NOT NULL AND ap.end_at <= NOW())
      OR LOWER(COALESCE(ap.created_by, '')) = public.condomit_auth_email()
    )
  ORDER BY ap.id, apo.display_order, apo.id;
$$;

CREATE OR REPLACE FUNCTION public.condomit_cast_post_assembly_vote(
  target_poll_id BIGINT,
  target_option_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  poll_row public.assembly_polls%ROWTYPE;
  assembly_row public.scheduled_assemblies%ROWTYPE;
  option_exists BOOLEAN;
  saved_row public.assembly_votes%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF caller_role = 'porteiro' THEN
    RAISE EXCEPTION 'Porteiros não podem votar.' USING ERRCODE = '42501';
  END IF;

  SELECT ap.* INTO poll_row
  FROM public.assembly_polls ap
  WHERE ap.id = target_poll_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Votação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  SELECT sa.* INTO assembly_row
  FROM public.scheduled_assemblies sa
  WHERE sa.id = poll_row.assembly_id
  LIMIT 1;

  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(assembly_row.cep) THEN
    RAISE EXCEPTION 'Assembleia de outro condomínio.' USING ERRCODE = '42501';
  END IF;

  IF LOWER(COALESCE(assembly_row.status, '')) <> 'encerrada' THEN
    RAISE EXCEPTION 'O voto pela ata só fica disponível após o encerramento da assembleia.' USING ERRCODE = '22023';
  END IF;

  IF LOWER(COALESCE(poll_row.status, '')) = 'cancelada' THEN
    RAISE EXCEPTION 'Esta votação foi cancelada.' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.assembly_poll_options o
    WHERE o.id = target_option_id AND o.poll_id = target_poll_id
  ) INTO option_exists;

  IF NOT option_exists THEN
    RAISE EXCEPTION 'Opção inválida para esta votação.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assembly_votes v
    WHERE v.poll_id = target_poll_id
      AND LOWER(COALESCE(v.user_email, '')) = caller_email
  ) THEN
    RAISE EXCEPTION 'Você já votou nesta votação.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.assembly_votes (
    poll_id, option_id, assembly_id, cep, user_email, created_at
  ) VALUES (
    poll_row.id,
    target_option_id,
    assembly_row.id,
    assembly_row.cep,
    caller_email,
    NOW()
  )
  RETURNING * INTO saved_row;

  RETURN to_jsonb(saved_row);
END;
$$;

-- ------------------------------------------------------------
-- 7. GRANTS
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.condomit_create_notification(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_my_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_reservation_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_all_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_create_reservation(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_delete_my_reservation(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_released_visitors_by_porter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_promote_resident_to_sindico(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_expulse_resident(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_append_assembly_transcript(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_assembly_poll_results(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_cast_post_assembly_vote(BIGINT, BIGINT) TO authenticated;
GRANT SELECT ON public.assembly_transcripts TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.assembly_transcripts_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.assembly_transcripts_id_seq TO authenticated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

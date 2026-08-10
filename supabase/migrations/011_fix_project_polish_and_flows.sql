-- ============================================================
-- MIGRAÇÃO 011 - POLIMENTOS E FLUXOS CONDOMIT
-- Prestadores, histórico de visitantes, manutenção, controle de
-- acesso, comentários pós-assembleia e encerramento automático.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. HELPERS COMPATÍVEIS COM CEP COM/SEM MÁSCARA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT LOWER(COALESCE(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.condomit_same_cep(a TEXT, b TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    NULLIF(REGEXP_REPLACE(COALESCE(a, ''), '\D', '', 'g'), '') IS NOT NULL
    AND REGEXP_REPLACE(COALESCE(a, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(b, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.condomit_user_belongs_to_cep(target_cep TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.condomit_auth_email() <> ''
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_condominiums uc
        WHERE LOWER(COALESCE(uc.user_email, '')) = public.condomit_auth_email()
          AND public.condomit_same_cep(uc.condominium_id::TEXT, target_cep)
      )
      OR EXISTS (
        SELECT 1
        FROM public.users u
        WHERE LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
          AND jsonb_typeof(u.condominium) = 'object'
          AND (
            public.condomit_same_cep(u.condominium ->> 'cep', target_cep)
            OR public.condomit_same_cep(u.condominium ->> 'condominium_id', target_cep)
            OR public.condomit_same_cep(u.condominium ->> 'condominium_cep', target_cep)
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.condomit_current_user_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT LOWER(COALESCE((
    SELECT u.user_type
    FROM public.users u
    WHERE LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
    LIMIT 1
  ), ''));
$$;

-- Retorna o CEP exatamente como está salvo em condominiums.
CREATE OR REPLACE FUNCTION public.condomit_canonical_cep(input_cep TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.cep
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep, input_cep)
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 1. PRESTADORES - NORMALIZA CEP + RLS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_service_provider_normalize_cep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical TEXT;
BEGIN
  canonical := public.condomit_canonical_cep(NEW.cep);
  IF canonical IS NULL THEN
    RAISE EXCEPTION 'CEP do condomínio não encontrado.' USING ERRCODE = '23503';
  END IF;
  NEW.cep := canonical;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_providers_normalize_cep ON public.service_providers;
CREATE TRIGGER trg_service_providers_normalize_cep
BEFORE INSERT OR UPDATE OF cep ON public.service_providers
FOR EACH ROW EXECUTE FUNCTION public.condomit_service_provider_normalize_cep();

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_providers_select_policy ON public.service_providers;
DROP POLICY IF EXISTS service_providers_insert_policy ON public.service_providers;
DROP POLICY IF EXISTS service_providers_update_policy ON public.service_providers;
DROP POLICY IF EXISTS service_providers_delete_policy ON public.service_providers;

CREATE POLICY service_providers_select_policy
ON public.service_providers FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(service_providers.cep));

CREATE POLICY service_providers_insert_policy
ON public.service_providers FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(service_providers.cep)
  AND public.condomit_current_user_type() IN ('porteiro', 'sindico', 'síndico', 'admin')
);

CREATE POLICY service_providers_update_policy
ON public.service_providers FOR UPDATE TO authenticated
USING (
  public.condomit_user_belongs_to_cep(service_providers.cep)
  AND public.condomit_current_user_type() IN ('porteiro', 'sindico', 'síndico', 'admin')
)
WITH CHECK (
  public.condomit_user_belongs_to_cep(service_providers.cep)
  AND public.condomit_current_user_type() IN ('porteiro', 'sindico', 'síndico', 'admin')
);

CREATE POLICY service_providers_delete_policy
ON public.service_providers FOR DELETE TO authenticated
USING (
  public.condomit_user_belongs_to_cep(service_providers.cep)
  AND public.condomit_current_user_type() IN ('porteiro', 'sindico', 'síndico', 'admin')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_providers TO authenticated;

-- ------------------------------------------------------------
-- 2. VISITANTES - GARANTE HISTÓRICO PARA TODA MUDANÇA DE STATUS
-- ------------------------------------------------------------
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'aguardando';
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS release_status_updated_at TIMESTAMPTZ;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS release_status_updated_by TEXT;

CREATE TABLE IF NOT EXISTS public.visitor_access_logs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL,
  visitor_cpf TEXT NOT NULL,
  visitor_name TEXT NOT NULL,
  responsible_cpf TEXT,
  responsible_name TEXT,
  apartment TEXT,
  block TEXT,
  action TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_cep_created
  ON public.visitor_access_logs(cep, created_at DESC);

CREATE OR REPLACE FUNCTION public.condomit_log_visitor_release_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  action_value TEXT;
  movement_value TEXT;
  responsible_name_value TEXT := '';
  apartment_value TEXT := '';
  block_value TEXT := '';
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.release_status IS NOT DISTINCT FROM OLD.release_status THEN
    RETURN NEW;
  END IF;

  CASE LOWER(COALESCE(NEW.release_status, ''))
    WHEN 'liberado' THEN action_value := 'liberacao'; movement_value := 'entry';
    WHEN 'revogado' THEN action_value := 'revogacao'; movement_value := 'exit';
    WHEN 'recusado' THEN action_value := 'recusa'; movement_value := 'exit';
    ELSE RETURN NEW;
  END CASE;

  SELECT
    COALESCE(u.name, ''),
    COALESCE(NULLIF(TRIM(uc.apartment::TEXT), ''), NULLIF(TRIM(u.condominium ->> 'apartment'), ''), NULLIF(TRIM(u.condominium ->> 'apartamento'), ''), ''),
    COALESCE(NULLIF(TRIM(uc.block::TEXT), ''), NULLIF(TRIM(u.condominium ->> 'block'), ''), NULLIF(TRIM(u.condominium ->> 'bloco'), ''), '')
  INTO responsible_name_value, apartment_value, block_value
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT x.apartment, x.block
    FROM public.user_condominiums x
    WHERE LOWER(COALESCE(x.user_email, '')) = LOWER(COALESCE(u.email, ''))
      AND public.condomit_same_cep(x.condominium_id::TEXT, NEW.cep)
    LIMIT 1
  ) uc ON TRUE
  WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
    = REGEXP_REPLACE(COALESCE(NEW.responsible_cpf, ''), '\D', '', 'g')
  LIMIT 1;

  INSERT INTO public.visitor_access_logs (
    cep, visitor_cpf, visitor_name, responsible_cpf, responsible_name,
    apartment, block, action, movement_type, created_by, created_at
  ) VALUES (
    NEW.cep,
    NEW.cpf,
    COALESCE(NULLIF(NEW.full_name, ''), 'Visitante'),
    NEW.responsible_cpf,
    COALESCE(responsible_name_value, ''),
    COALESCE(apartment_value, ''),
    COALESCE(block_value, ''),
    action_value,
    movement_value,
    COALESCE(NULLIF(NEW.release_status_updated_by, ''), public.condomit_auth_email()),
    COALESCE(NEW.release_status_updated_at, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitors_release_access_log ON public.visitors;
CREATE TRIGGER trg_visitors_release_access_log
AFTER UPDATE OF release_status ON public.visitors
FOR EACH ROW EXECUTE FUNCTION public.condomit_log_visitor_release_change();

-- Substitui a RPC da migration 010 para evitar log duplicado: o trigger acima
-- passa a ser a única fonte do histórico.
DROP FUNCTION IF EXISTS public.condomit_set_visitor_release_status(TEXT, TEXT);
CREATE FUNCTION public.condomit_set_visitor_release_status(target_cpf TEXT, next_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_type();
  normalized_target TEXT := REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g');
  normalized_next TEXT := LOWER(TRIM(COALESCE(next_status, '')));
  final_status TEXT;
  visitor_row public.visitors%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida. Faça login novamente.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(caller_role, '') NOT IN ('porteiro', 'sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Usuário sem permissão para alterar a liberação do visitante.' USING ERRCODE = '42501';
  END IF;

  IF LENGTH(normalized_target) <> 11 THEN
    RAISE EXCEPTION 'CPF do visitante inválido.' USING ERRCODE = '22023';
  END IF;

  CASE normalized_next
    WHEN 'liberado' THEN final_status := 'liberado';
    WHEN 'approved' THEN final_status := 'liberado';
    WHEN 'released' THEN final_status := 'liberado';
    WHEN 'revogado' THEN final_status := 'revogado';
    WHEN 'revoked' THEN final_status := 'revogado';
    WHEN 'aguardando' THEN final_status := 'revogado';
    WHEN 'pending' THEN final_status := 'revogado';
    WHEN 'recusado' THEN final_status := 'recusado';
    WHEN 'rejected' THEN final_status := 'recusado';
    ELSE RAISE EXCEPTION 'Status de liberação inválido.' USING ERRCODE = '22023';
  END CASE;

  SELECT v.* INTO visitor_row
  FROM public.visitors v
  WHERE REGEXP_REPLACE(COALESCE(v.cpf, ''), '\D', '', 'g') = normalized_target
    AND public.condomit_user_belongs_to_cep(v.cep)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visitante não encontrado no condomínio do usuário.' USING ERRCODE = 'P0002';
  END IF;

  IF LOWER(COALESCE(visitor_row.release_status, 'aguardando')) = final_status THEN
    RETURN jsonb_build_object('cpf', visitor_row.cpf, 'release_status', visitor_row.release_status, 'changed', FALSE);
  END IF;

  UPDATE public.visitors
  SET release_status = final_status,
      release_status_updated_at = NOW(),
      release_status_updated_by = caller_email
  WHERE cpf = visitor_row.cpf
  RETURNING * INTO visitor_row;

  RETURN jsonb_build_object(
    'cpf', visitor_row.cpf,
    'release_status', visitor_row.release_status,
    'release_status_updated_at', visitor_row.release_status_updated_at,
    'release_status_updated_by', visitor_row.release_status_updated_by,
    'changed', TRUE
  );
END;
$$;

-- Leitura do histórico usada por registro-entrada-saida.js.
CREATE OR REPLACE FUNCTION public.condomit_list_visitor_access_logs()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(log_row)
  FROM public.visitor_access_logs log_row
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_current_user_type() IN ('porteiro', 'sindico', 'síndico', 'admin')
    AND public.condomit_user_belongs_to_cep(log_row.cep)
  ORDER BY log_row.created_at DESC
  LIMIT 500;
$$;

-- ------------------------------------------------------------
-- 3. MANUTENÇÃO PREVENTIVA - BANCO COMO FONTE ÚNICA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_items (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency TEXT NOT NULL,
  next_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluida')),
  created_by TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_items_cep_date
  ON public.maintenance_items(cep, next_date, status);

-- Pedido explícito: iniciar a nova manutenção sem os exemplos/registros anteriores.
-- A flag evita que uma eventual reexecução da migration apague manutenções novas.
CREATE TABLE IF NOT EXISTS public.condomit_migration_state (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.condomit_migration_state
    WHERE migration_key = '011_maintenance_initial_reset'
  ) THEN
    DELETE FROM public.maintenance_items;
    INSERT INTO public.condomit_migration_state(migration_key)
    VALUES ('011_maintenance_initial_reset');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.condomit_maintenance_normalize_cep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE canonical TEXT;
BEGIN
  canonical := public.condomit_canonical_cep(NEW.cep);
  IF canonical IS NULL THEN
    RAISE EXCEPTION 'CEP do condomínio não encontrado.' USING ERRCODE = '23503';
  END IF;
  NEW.cep := canonical;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_items_normalize_cep ON public.maintenance_items;
CREATE TRIGGER trg_maintenance_items_normalize_cep
BEFORE INSERT OR UPDATE ON public.maintenance_items
FOR EACH ROW EXECUTE FUNCTION public.condomit_maintenance_normalize_cep();

ALTER TABLE public.maintenance_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maintenance_items_select_policy ON public.maintenance_items;
DROP POLICY IF EXISTS maintenance_items_insert_policy ON public.maintenance_items;
DROP POLICY IF EXISTS maintenance_items_update_policy ON public.maintenance_items;
DROP POLICY IF EXISTS maintenance_items_delete_policy ON public.maintenance_items;

CREATE POLICY maintenance_items_select_policy
ON public.maintenance_items FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(maintenance_items.cep));

CREATE POLICY maintenance_items_insert_policy
ON public.maintenance_items FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(maintenance_items.cep)
  AND LOWER(COALESCE(maintenance_items.created_by, '')) = public.condomit_auth_email()
  AND public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
);

CREATE POLICY maintenance_items_update_policy
ON public.maintenance_items FOR UPDATE TO authenticated
USING (public.condomit_user_belongs_to_cep(maintenance_items.cep) AND public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin'))
WITH CHECK (public.condomit_user_belongs_to_cep(maintenance_items.cep) AND public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin'));

CREATE POLICY maintenance_items_delete_policy
ON public.maintenance_items FOR DELETE TO authenticated
USING (public.condomit_user_belongs_to_cep(maintenance_items.cep) AND public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.maintenance_items_id_seq TO authenticated;

-- ------------------------------------------------------------
-- 4. CONTROLE DE ACESSO - VEÍCULOS E DEPENDENTES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_vehicles (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  plate TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_vehicles_cep_plate_unique
  ON public.access_vehicles(cep, LOWER(REGEXP_REPLACE(plate, '[^A-Za-z0-9]', '', 'g')));

CREATE TABLE IF NOT EXISTS public.access_dependents (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf TEXT,
  relationship TEXT NOT NULL,
  phone TEXT,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_dependents_cep_user ON public.access_dependents(cep, user_email);

CREATE OR REPLACE FUNCTION public.condomit_access_normalize_cep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE canonical TEXT;
BEGIN
  canonical := public.condomit_canonical_cep(NEW.cep);
  IF canonical IS NULL THEN RAISE EXCEPTION 'CEP do condomínio não encontrado.' USING ERRCODE = '23503'; END IF;
  NEW.cep := canonical;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_access_vehicles_normalize_cep ON public.access_vehicles;
CREATE TRIGGER trg_access_vehicles_normalize_cep BEFORE INSERT OR UPDATE OF cep ON public.access_vehicles
FOR EACH ROW EXECUTE FUNCTION public.condomit_access_normalize_cep();
DROP TRIGGER IF EXISTS trg_access_dependents_normalize_cep ON public.access_dependents;
CREATE TRIGGER trg_access_dependents_normalize_cep BEFORE INSERT OR UPDATE OF cep ON public.access_dependents
FOR EACH ROW EXECUTE FUNCTION public.condomit_access_normalize_cep();

ALTER TABLE public.access_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_dependents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_vehicles_select_policy ON public.access_vehicles;
DROP POLICY IF EXISTS access_vehicles_insert_policy ON public.access_vehicles;
DROP POLICY IF EXISTS access_vehicles_delete_policy ON public.access_vehicles;
CREATE POLICY access_vehicles_select_policy ON public.access_vehicles FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(cep) AND (LOWER(user_email) = public.condomit_auth_email() OR public.condomit_current_user_type() IN ('sindico','síndico','porteiro','admin')));
CREATE POLICY access_vehicles_insert_policy ON public.access_vehicles FOR INSERT TO authenticated
WITH CHECK (public.condomit_user_belongs_to_cep(cep) AND LOWER(user_email) = public.condomit_auth_email());
CREATE POLICY access_vehicles_delete_policy ON public.access_vehicles FOR DELETE TO authenticated
USING (public.condomit_user_belongs_to_cep(cep) AND (LOWER(user_email) = public.condomit_auth_email() OR public.condomit_current_user_type() IN ('sindico','síndico','admin')));

DROP POLICY IF EXISTS access_dependents_select_policy ON public.access_dependents;
DROP POLICY IF EXISTS access_dependents_insert_policy ON public.access_dependents;
DROP POLICY IF EXISTS access_dependents_delete_policy ON public.access_dependents;
CREATE POLICY access_dependents_select_policy ON public.access_dependents FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(cep) AND (LOWER(user_email) = public.condomit_auth_email() OR public.condomit_current_user_type() IN ('sindico','síndico','porteiro','admin')));
CREATE POLICY access_dependents_insert_policy ON public.access_dependents FOR INSERT TO authenticated
WITH CHECK (public.condomit_user_belongs_to_cep(cep) AND LOWER(user_email) = public.condomit_auth_email());
CREATE POLICY access_dependents_delete_policy ON public.access_dependents FOR DELETE TO authenticated
USING (public.condomit_user_belongs_to_cep(cep) AND (LOWER(user_email) = public.condomit_auth_email() OR public.condomit_current_user_type() IN ('sindico','síndico','admin')));

GRANT SELECT, INSERT, DELETE ON public.access_vehicles, public.access_dependents TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.access_vehicles_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.access_dependents_id_seq TO authenticated;

-- ------------------------------------------------------------
-- 5. COMENTÁRIOS PÓS-ASSEMBLEIA PARA O RESUMO/ATA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assembly_post_comments (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assembly_id BIGINT NOT NULL REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  comment TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(comment)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assembly_post_comments_assembly_created
  ON public.assembly_post_comments(assembly_id, created_at);

ALTER TABLE public.assembly_post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assembly_post_comments_select_policy ON public.assembly_post_comments;
DROP POLICY IF EXISTS assembly_post_comments_insert_policy ON public.assembly_post_comments;
CREATE POLICY assembly_post_comments_select_policy ON public.assembly_post_comments FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(cep));
CREATE POLICY assembly_post_comments_insert_policy ON public.assembly_post_comments FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(user_email, '')) = public.condomit_auth_email()
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = assembly_post_comments.assembly_id
      AND public.condomit_same_cep(sa.cep, assembly_post_comments.cep)
  )
);
GRANT SELECT, INSERT ON public.assembly_post_comments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.assembly_post_comments_id_seq TO authenticated;

-- ------------------------------------------------------------
-- 6. ENCERRAR ASSEMBLEIA APÓS 30 MIN SEM NINGUÉM NA SALA
-- Considera presente apenas heartbeat recente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_close_stale_assemblies()
RETURNS TABLE (assembly_id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT sa.id
    FROM public.scheduled_assemblies sa
    WHERE LOWER(COALESCE(sa.status, '')) IN ('agendada', 'em_andamento')
      AND (sa.date::date + sa.start_time::time) <= ((NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '30 minutes')
      AND NOT EXISTS (
        SELECT 1
        FROM public.assembly_attendance aa
        WHERE aa.assembly_id = sa.id
          AND LOWER(COALESCE(aa.presence_status, '')) = 'presente'
          AND COALESCE(aa.last_heartbeat_at, aa.updated_at, aa.joined_at) >= NOW() - INTERVAL '2 minutes'
      )
  ), updated AS (
    UPDATE public.scheduled_assemblies sa
    SET status = 'encerrada'
    WHERE sa.id IN (SELECT id FROM candidates)
    RETURNING sa.id
  )
  SELECT id FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_close_stale_assemblies() FROM PUBLIC;
-- Não concedemos authenticated: a execução periódica usa service role.

-- ------------------------------------------------------------
-- 7. GRANTS DE HELPERS/RPCS
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.condomit_user_belongs_to_cep(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_current_user_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_canonical_cep(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_auth_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_same_cep(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_user_belongs_to_cep(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_current_user_type() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_canonical_cep(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_set_visitor_release_status(TEXT, TEXT) TO authenticated;
GRANT SELECT ON public.visitor_access_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_visitor_access_logs() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

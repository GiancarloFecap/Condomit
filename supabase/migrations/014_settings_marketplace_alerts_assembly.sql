-- ============================================================
-- MIGRAÇÃO 014 - CONFIGURAÇÕES, MARKETPLACE E ASSEMBLEIAS
-- Condomit
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. INFORMAÇÕES DO CONDOMÍNIO + SÍNDICO RESPONSÁVEL
-- Retorna apenas informações do condomínio atual do usuário.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_current_condominium_info()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cep TEXT := public.condomit_current_user_cep();
  v_condo JSONB := '{}'::jsonb;
  v_manager_name TEXT := '';
  v_manager_phone TEXT := '';
  v_manager_email TEXT := '';
BEGIN
  IF v_cep IS NULL OR TRIM(v_cep) = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT TO_JSONB(c)
  INTO v_condo
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep, v_cep)
  LIMIT 1;

  SELECT
    COALESCE(u.name, ''),
    COALESCE(u.phone, ''),
    COALESCE(u.email, '')
  INTO
    v_manager_name,
    v_manager_phone,
    v_manager_email
  FROM public.users u
  LEFT JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
   AND public.condomit_same_cep(uc.condominium_id::TEXT, v_cep)
  WHERE LOWER(COALESCE(u.user_type, '')) IN ('sindico', 'síndico')
    AND (
      uc.user_email IS NOT NULL
      OR (
        JSONB_TYPEOF(u.condominium) = 'object'
        AND (
          public.condomit_same_cep(u.condominium ->> 'cep', v_cep)
          OR public.condomit_same_cep(u.condominium ->> 'condominium_id', v_cep)
          OR public.condomit_same_cep(u.condominium ->> 'condominium_cep', v_cep)
        )
      )
    )
  ORDER BY CASE WHEN uc.user_email IS NOT NULL THEN 0 ELSE 1 END, u.email
  LIMIT 1;

  RETURN COALESCE(v_condo, '{}'::jsonb)
    || JSONB_BUILD_OBJECT(
      'cep', v_cep,
      'manager_name', v_manager_name,
      'syndic_name', v_manager_name,
      'contact_phone', v_manager_phone,
      'phone', COALESCE(NULLIF(v_manager_phone, ''), v_condo ->> 'phone', ''),
      'manager_email', v_manager_email
    );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_current_condominium_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_current_condominium_info() TO authenticated;

-- ------------------------------------------------------------
-- 2. MARKETPLACE - DONO REAL DO ANÚNCIO
-- A tabela antiga possuía apenas user_name, que não identifica o autor
-- com segurança. seller_email passa a guardar a conta dona do anúncio.
-- ------------------------------------------------------------
ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS seller_email TEXT;

CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller_email
  ON public.marketplace_items (LOWER(seller_email));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.marketplace_items'::regclass
      AND conname = 'marketplace_items_seller_email_fkey'
  ) THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT marketplace_items_seller_email_fkey
      FOREIGN KEY (seller_email)
      REFERENCES public.users(email)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

-- Tenta vincular anúncios antigos somente quando existe exatamente um
-- usuário com o mesmo nome dentro do mesmo condomínio.
DO $$
DECLARE
  item_record RECORD;
  candidate_email TEXT;
BEGIN
  FOR item_record IN
    SELECT id, cep, user_name
    FROM public.marketplace_items
    WHERE seller_email IS NULL
  LOOP
    SELECT CASE WHEN COUNT(*) = 1 THEN MIN(u.email) ELSE NULL END
    INTO candidate_email
    FROM public.users u
    WHERE LOWER(TRIM(COALESCE(u.name, ''))) = LOWER(TRIM(COALESCE(item_record.user_name, '')))
      AND public.condomit_email_belongs_to_cep(u.email, item_record.cep);

    IF candidate_email IS NOT NULL THEN
      UPDATE public.marketplace_items
      SET seller_email = candidate_email
      WHERE id = item_record.id
        AND seller_email IS NULL;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.condomit_marketplace_set_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT := public.condomit_auth_email();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_email <> '' THEN
      NEW.seller_email := v_email;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- O proprietário de um anúncio nunca pode ser trocado pelo cliente.
    NEW.seller_email := OLD.seller_email;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_set_owner ON public.marketplace_items;
CREATE TRIGGER trg_marketplace_set_owner
BEFORE INSERT OR UPDATE ON public.marketplace_items
FOR EACH ROW EXECUTE FUNCTION public.condomit_marketplace_set_owner();

ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_items_select_policy ON public.marketplace_items;
DROP POLICY IF EXISTS marketplace_items_insert_policy ON public.marketplace_items;
DROP POLICY IF EXISTS marketplace_items_update_policy ON public.marketplace_items;
DROP POLICY IF EXISTS marketplace_items_delete_policy ON public.marketplace_items;

CREATE POLICY marketplace_items_select_policy
ON public.marketplace_items
FOR SELECT
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(cep)
);

CREATE POLICY marketplace_items_insert_policy
ON public.marketplace_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(seller_email, '')) = public.condomit_auth_email()
);

CREATE POLICY marketplace_items_update_policy
ON public.marketplace_items
FOR UPDATE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(seller_email, '')) = public.condomit_auth_email()
)
WITH CHECK (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(seller_email, '')) = public.condomit_auth_email()
);

CREATE POLICY marketplace_items_delete_policy
ON public.marketplace_items
FOR DELETE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(seller_email, '')) = public.condomit_auth_email()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_items TO authenticated;

-- ------------------------------------------------------------
-- 3. ENCERRAR ASSEMBLEIAS SEM PARTICIPANTES APÓS 15 MINUTOS
-- A Scheduled Function do Netlify chama esta RPC a cada 5 minutos.
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
      AND (sa.date::date + sa.start_time::time)
          <= ((NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '15 minutes')
      AND NOT EXISTS (
        SELECT 1
        FROM public.assembly_attendance aa
        WHERE aa.assembly_id = sa.id
          AND LOWER(COALESCE(aa.presence_status, '')) = 'presente'
          AND COALESCE(aa.last_heartbeat_at, aa.updated_at, aa.joined_at)
              >= NOW() - INTERVAL '2 minutes'
      )
  ), updated AS (
    UPDATE public.scheduled_assemblies sa
    SET
      status = 'encerrada',
      ended_at = COALESCE(sa.ended_at, NOW())
    WHERE sa.id IN (SELECT id FROM candidates)
    RETURNING sa.id
  )
  SELECT id FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_close_stale_assemblies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_close_stale_assemblies() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

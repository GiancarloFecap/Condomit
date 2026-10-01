-- Condomit v0.72.1 - corrige cadastro de manutenção preventiva bloqueado pelo RLS
BEGIN;

-- Política direta mais robusta: aceita as duas funções de cargo mantidas pelo projeto
-- e continua exigindo vínculo com o próprio condomínio + autoria da sessão.
ALTER TABLE public.maintenance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_items_insert_policy ON public.maintenance_items;
DROP POLICY IF EXISTS maintenance_items_update_policy ON public.maintenance_items;
DROP POLICY IF EXISTS maintenance_items_delete_policy ON public.maintenance_items;

CREATE POLICY maintenance_items_insert_policy
ON public.maintenance_items FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(maintenance_items.cep)
  AND LOWER(COALESCE(maintenance_items.created_by, '')) = LOWER(COALESCE(public.condomit_auth_email(), ''))
  AND (
    LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
    OR LOWER(COALESCE(public.condomit_current_user_type(), '')) IN ('sindico','síndico','admin')
  )
);

CREATE POLICY maintenance_items_update_policy
ON public.maintenance_items FOR UPDATE TO authenticated
USING (
  public.condomit_user_belongs_to_cep(maintenance_items.cep)
  AND (
    LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
    OR LOWER(COALESCE(public.condomit_current_user_type(), '')) IN ('sindico','síndico','admin')
  )
)
WITH CHECK (
  public.condomit_user_belongs_to_cep(maintenance_items.cep)
  AND (
    LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
    OR LOWER(COALESCE(public.condomit_current_user_type(), '')) IN ('sindico','síndico','admin')
  )
);

CREATE POLICY maintenance_items_delete_policy
ON public.maintenance_items FOR DELETE TO authenticated
USING (
  public.condomit_user_belongs_to_cep(maintenance_items.cep)
  AND (
    LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
    OR LOWER(COALESCE(public.condomit_current_user_type(), '')) IN ('sindico','síndico','admin')
  )
);

-- RPC SECURITY DEFINER usada pela tela de Manutenção Preventiva.
-- O cliente não escolhe CEP nem created_by: ambos são derivados da sessão autenticada.
CREATE OR REPLACE FUNCTION public.condomit_create_maintenance_043(
  target_cep TEXT,
  title_value TEXT,
  description_value TEXT,
  location_value TEXT,
  category_value TEXT,
  frequency_value TEXT,
  next_date_value DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := LOWER(COALESCE(public.condomit_auth_email(), ''));
  caller_role TEXT := LOWER(COALESCE(NULLIF(public.condomit_current_user_role(), ''), public.condomit_current_user_type(), ''));
  caller_db_email TEXT;
  caller_cep TEXT;
  saved public.maintenance_items%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF caller_role NOT IN ('sindico','síndico','admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode cadastrar manutenções preventivas.' USING ERRCODE = '42501';
  END IF;

  SELECT u.email INTO caller_db_email
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  IF caller_db_email IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado não encontrado no cadastro.' USING ERRCODE = '42501';
  END IF;

  caller_cep := COALESCE(
    public.condomit_canonical_cep(NULLIF(TRIM(COALESCE(target_cep, '')), '')),
    public.condomit_current_user_cep()
  );

  IF caller_cep IS NULL OR TRIM(caller_cep) = '' OR NOT public.condomit_user_belongs_to_cep(caller_cep) THEN
    RAISE EXCEPTION 'Não foi possível identificar um condomínio autorizado para esta conta.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(title_value,'')), '') IS NULL
     OR NULLIF(TRIM(COALESCE(location_value,'')), '') IS NULL
     OR NULLIF(TRIM(COALESCE(description_value,'')), '') IS NULL
     OR next_date_value IS NULL THEN
    RAISE EXCEPTION 'Preencha todos os campos obrigatórios.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.maintenance_items (
    cep, title, description, location, category, frequency,
    next_date, status, created_by
  ) VALUES (
    caller_cep,
    TRIM(title_value),
    TRIM(description_value),
    TRIM(location_value),
    COALESCE(NULLIF(TRIM(category_value), ''), 'Outros'),
    COALESCE(NULLIF(TRIM(frequency_value), ''), 'Mensal'),
    next_date_value,
    'pendente',
    caller_db_email
  )
  RETURNING * INTO saved;

  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_create_maintenance_043(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_create_maintenance_043(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.maintenance_items_id_seq TO authenticated;

COMMIT;

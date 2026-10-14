BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_assembly_election_candidates(target_assembly_id BIGINT)
RETURNS TABLE(email TEXT, name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    assembly_cep TEXT;
    caller_email TEXT := LOWER(BTRIM(COALESCE(auth.email(), '')));
    allowed_to_manage BOOLEAN := FALSE;
BEGIN
    IF caller_email = '' OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sessão autenticada necessária.' USING ERRCODE = '42501';
    END IF;

    SELECT sa.cep INTO assembly_cep
      FROM public.scheduled_assemblies sa
     WHERE sa.id = target_assembly_id;
    IF assembly_cep IS NULL THEN
        RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE = '22023';
    END IF;

    IF NOT public.condomit_user_belongs_to_cep(assembly_cep) THEN
        RAISE EXCEPTION 'Assembleia fora do condomínio do usuário.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS(
       SELECT 1 FROM public.scheduled_assemblies sa
        WHERE sa.id = target_assembly_id
          AND LOWER(COALESCE(sa.created_by,'')) = caller_email
    ) OR EXISTS(
       SELECT 1 FROM public.users u
        WHERE LOWER(COALESCE(u.email,'')) = caller_email
          AND LOWER(COALESCE(u.user_type,'')) IN ('sindico','administradora','admin')
    ) INTO allowed_to_manage;

    IF NOT allowed_to_manage THEN
        RAISE EXCEPTION 'Somente a gestão da assembleia pode preparar a eleição.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT LOWER(TRIM(u.email))::TEXT,
           COALESCE(NULLIF(TRIM(u.name),''),u.email)::TEXT
      FROM public.user_condominiums uc
      JOIN public.users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(uc.user_email))
     WHERE public.condomit_same_cep(uc.condominium_id::TEXT, assembly_cep)
     GROUP BY LOWER(TRIM(u.email)), COALESCE(NULLIF(TRIM(u.name),''),u.email)
     ORDER BY COALESCE(NULLIF(TRIM(u.name),''),u.email);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_assembly_election_candidates(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_assembly_election_candidates(BIGINT) TO authenticated;

COMMIT;

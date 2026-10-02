-- ============================================================
-- CONDOMIT - MIGRACAO 046
-- Conversas salvas persistentes.
-- Um contato adicionado permanece em "Conversas" até que o
-- próprio usuário use a ação "Excluir conversa".
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_chat_list_saved_contacts()
RETURNS TABLE (
  email TEXT,
  name TEXT,
  phone TEXT,
  user_type TEXT,
  profile_photo TEXT,
  apartment TEXT,
  block TEXT,
  cep TEXT,
  saved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (LOWER(sc.contact_email))
    COALESCE(NULLIF(u.email, ''), sc.contact_email)::TEXT AS email,
    COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), sc.contact_email)::TEXT AS name,
    COALESCE(u.phone, '')::TEXT AS phone,
    COALESCE(u.user_type, '')::TEXT AS user_type,
    u.profile_photo::TEXT AS profile_photo,
    COALESCE(uc.apartment::TEXT, '')::TEXT AS apartment,
    COALESCE(uc.block::TEXT, '')::TEXT AS block,
    sc.cep::TEXT AS cep,
    sc.created_at AS saved_at
  FROM public.condomit_chat_saved_contacts sc
  LEFT JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(sc.contact_email, ''))
  LEFT JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(sc.contact_email, ''))
   AND public.condomit_same_cep(uc.condominium_id::TEXT, sc.cep)
  WHERE LOWER(sc.owner_email) = caller_email
    AND public.condomit_same_cep(sc.cep, caller_cep)
  ORDER BY LOWER(sc.contact_email), sc.created_at DESC, COALESCE(uc.joined_at, sc.created_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_chat_list_saved_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_chat_list_saved_contacts() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

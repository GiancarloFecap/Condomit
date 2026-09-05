-- Condomit 0.71.0 - sessão pendente de 2FA e consentimentos
BEGIN;
ALTER TABLE public.two_factor_login_challenges ADD COLUMN IF NOT EXISTS session_ciphertext TEXT;

CREATE TABLE IF NOT EXISTS public.user_consents (
  user_email TEXT PRIMARY KEY,
  optional_communications BOOLEAN NOT NULL DEFAULT FALSE,
  analytics BOOLEAN NOT NULL DEFAULT FALSE,
  personalization BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_consents_select_041 ON public.user_consents;
DROP POLICY IF EXISTS user_consents_insert_041 ON public.user_consents;
DROP POLICY IF EXISTS user_consents_update_041 ON public.user_consents;
CREATE POLICY user_consents_select_041 ON public.user_consents FOR SELECT TO authenticated USING (LOWER(user_email)=LOWER(COALESCE(auth.email(),'')));
CREATE POLICY user_consents_insert_041 ON public.user_consents FOR INSERT TO authenticated WITH CHECK (LOWER(user_email)=LOWER(COALESCE(auth.email(),'')));
CREATE POLICY user_consents_update_041 ON public.user_consents FOR UPDATE TO authenticated USING (LOWER(user_email)=LOWER(COALESCE(auth.email(),''))) WITH CHECK (LOWER(user_email)=LOWER(COALESCE(auth.email(),'')));

CREATE OR REPLACE FUNCTION public.condomit_get_my_consents_041()
RETURNS TABLE(optional_communications BOOLEAN, analytics BOOLEAN, personalization BOOLEAN, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE caller TEXT:=LOWER(COALESCE(public.condomit_auth_email(),''));
BEGIN
  IF caller='' THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.user_consents(user_email) VALUES(caller) ON CONFLICT(user_email) DO NOTHING;
  RETURN QUERY SELECT c.optional_communications,c.analytics,c.personalization,c.updated_at FROM public.user_consents c WHERE LOWER(c.user_email)=caller LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.condomit_save_my_consents_041(optional_communications_value BOOLEAN, analytics_value BOOLEAN, personalization_value BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE caller TEXT:=LOWER(COALESCE(public.condomit_auth_email(),'')); saved public.user_consents%ROWTYPE;
BEGIN
 IF caller='' THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.user_consents(user_email,optional_communications,analytics,personalization,updated_at)
 VALUES(caller,COALESCE(optional_communications_value,FALSE),COALESCE(analytics_value,FALSE),COALESCE(personalization_value,FALSE),NOW())
 ON CONFLICT(user_email) DO UPDATE SET optional_communications=EXCLUDED.optional_communications,analytics=EXCLUDED.analytics,personalization=EXCLUDED.personalization,updated_at=NOW()
 RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END; $$;
REVOKE ALL ON FUNCTION public.condomit_get_my_consents_041() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_save_my_consents_041(BOOLEAN,BOOLEAN,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_get_my_consents_041() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_save_my_consents_041(BOOLEAN,BOOLEAN,BOOLEAN) TO authenticated;
COMMIT;

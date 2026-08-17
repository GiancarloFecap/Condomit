-- ============================================================
-- CONDOMIT - MIGRAÇÃO 022
-- Histórico pessoal de ocorrências para todos os perfis.
--
-- Cada usuário pode consultar todas as ocorrências registradas pela
-- própria conta. Síndicos continuam podendo consultar as ocorrências
-- do condomínio atual. O front-end aplica o filtro de CEP na visão
-- administrativa "Ver ocorrências".
-- ============================================================

BEGIN;

ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS occurrences_select_policy ON public.occurrences;

CREATE POLICY occurrences_select_policy
ON public.occurrences
FOR SELECT
TO authenticated
USING (
  LOWER(COALESCE(occurrences.reporter_email, '')) = public.condomit_auth_email()
  OR (
    public.condomit_user_belongs_to_cep(occurrences.cep)
    AND (
      public.condomit_current_user_role() IN ('sindico', 'síndico', 'admin')
      OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
    )
  )
);

COMMIT;

-- Condomit 0.67.0 - gravações na Ata, RLS de logo e síndico responsável
BEGIN;

-- Síndico do condomínio atual sem expor a tabela users ao cliente.
CREATE OR REPLACE FUNCTION public.condomit_current_condominium_manager_039()
RETURNS TABLE(name TEXT, phone TEXT, email TEXT, user_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH current_condo AS (
    SELECT public.condomit_current_user_cep() AS cep
  )
  SELECT u.name, u.phone, u.email, u.user_type AS user_type
  FROM public.users u, current_condo cc
  WHERE LOWER(COALESCE(u.user_type, '')) IN ('sindico','síndico','admin')
    AND EXISTS (
      SELECT 1 FROM public.condomit_user_condo_ceps(u.email) x
      WHERE public.condomit_same_cep(x.cep, cc.cep)
    )
  ORDER BY CASE WHEN LOWER(COALESCE(u.user_type, '')) IN ('sindico','síndico') THEN 0 ELSE 1 END,
           u.email
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.condomit_current_condominium_manager_039() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_current_condominium_manager_039() TO authenticated;

-- Gravações: qualquer síndico/admin autenticado do mesmo condomínio pode persistir;
-- moradores do condomínio podem ler para a Ata.
ALTER TABLE public.assembly_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assembly_recordings_select_policy ON public.assembly_recordings;
DROP POLICY IF EXISTS assembly_recordings_modify_policy ON public.assembly_recordings;
DROP POLICY IF EXISTS condomit_assembly_recordings_select_039 ON public.assembly_recordings;
DROP POLICY IF EXISTS condomit_assembly_recordings_insert_039 ON public.assembly_recordings;
DROP POLICY IF EXISTS condomit_assembly_recordings_update_039 ON public.assembly_recordings;
DROP POLICY IF EXISTS condomit_assembly_recordings_delete_039 ON public.assembly_recordings;

CREATE POLICY condomit_assembly_recordings_select_039 ON public.assembly_recordings
FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(assembly_recordings.cep));

CREATE POLICY condomit_assembly_recordings_insert_039 ON public.assembly_recordings
FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(assembly_recordings.cep)
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (SELECT 1 FROM public.scheduled_assemblies sa WHERE sa.id=assembly_recordings.assembly_id AND public.condomit_same_cep(sa.cep, assembly_recordings.cep))
);
CREATE POLICY condomit_assembly_recordings_update_039 ON public.assembly_recordings
FOR UPDATE TO authenticated
USING (public.condomit_user_belongs_to_cep(assembly_recordings.cep) AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin'))
WITH CHECK (public.condomit_user_belongs_to_cep(assembly_recordings.cep) AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin'));
CREATE POLICY condomit_assembly_recordings_delete_039 ON public.assembly_recordings
FOR DELETE TO authenticated
USING (public.condomit_user_belongs_to_cep(assembly_recordings.cep) AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin'));

DROP POLICY IF EXISTS "condomit_assembly_recordings_upload" ON storage.objects;
DROP POLICY IF EXISTS "condomit_assembly_recordings_read" ON storage.objects;
DROP POLICY IF EXISTS "condomit_assembly_recordings_delete" ON storage.objects;
CREATE POLICY "condomit_assembly_recordings_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='condomit-assembly-recordings'
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE WHEN (storage.foldername(name))[1] ~ '^[0-9]+$' THEN (storage.foldername(name))[1]::BIGINT ELSE NULL END
      AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);
CREATE POLICY "condomit_assembly_recordings_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='condomit-assembly-recordings'
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE WHEN (storage.foldername(name))[1] ~ '^[0-9]+$' THEN (storage.foldername(name))[1]::BIGINT ELSE NULL END
      AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);
CREATE POLICY "condomit_assembly_recordings_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='condomit-assembly-recordings'
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE WHEN (storage.foldername(name))[1] ~ '^[0-9]+$' THEN (storage.foldername(name))[1]::BIGINT ELSE NULL END
      AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

-- Logo do condomínio: corrige INSERT bloqueado para contas de síndico válidas.
DROP POLICY IF EXISTS "condomit_syndic_upload_condo_logos" ON storage.objects;
DROP POLICY IF EXISTS "condomit_syndic_update_condo_logos" ON storage.objects;
DROP POLICY IF EXISTS "condomit_syndic_delete_condo_logos" ON storage.objects;
CREATE POLICY "condomit_syndic_upload_condo_logos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='condomit-condominium-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
);
CREATE POLICY "condomit_syndic_update_condo_logos" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='condomit-condominium-logos' AND (storage.foldername(name))[1]=auth.uid()::text AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin'))
WITH CHECK (bucket_id='condomit-condominium-logos' AND (storage.foldername(name))[1]=auth.uid()::text AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin'));
CREATE POLICY "condomit_syndic_delete_condo_logos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='condomit-condominium-logos' AND (storage.foldername(name))[1]=auth.uid()::text AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin'));

COMMIT;

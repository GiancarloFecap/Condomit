BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('condomit-assembly-documents', 'condomit-assembly-documents', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

DROP POLICY IF EXISTS condomit_assembly_docs_read_055 ON storage.objects;
CREATE POLICY condomit_assembly_docs_read_055 ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'condomit-assembly-documents'
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE WHEN COALESCE((storage.foldername(name))[1],'') ~ '^[0-9]+$'
      THEN (storage.foldername(name))[1]::BIGINT ELSE NULL END
    AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

DROP POLICY IF EXISTS condomit_assembly_docs_write_055 ON storage.objects;
CREATE POLICY condomit_assembly_docs_write_055 ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'condomit-assembly-documents'
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE WHEN COALESCE((storage.foldername(name))[1],'') ~ '^[0-9]+$'
      THEN (storage.foldername(name))[1]::BIGINT ELSE NULL END
    AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

-- Metadados podem ser vistos pelos usuários do mesmo condomínio,
-- independentemente da formatação armazenada para o CEP.
DROP POLICY IF EXISTS assembly_documents_condo_read_055 ON public.assembly_documents;
CREATE POLICY assembly_documents_condo_read_055 ON public.assembly_documents
FOR SELECT TO authenticated USING (
  public.condomit_user_belongs_to_cep(cep)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
  AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='assembly_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assembly_documents;
  END IF;
END $$;
COMMIT;

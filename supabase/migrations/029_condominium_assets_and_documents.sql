-- ============================================================
-- CONDOMIT 0.39.0
-- Logo do condomínio e regulamento interno armazenados no Supabase Storage.
-- ============================================================

ALTER TABLE public.condominiums
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS logo_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS internal_regulation_path TEXT,
    ADD COLUMN IF NOT EXISTS internal_regulation_name TEXT,
    ADD COLUMN IF NOT EXISTS internal_regulation_mime TEXT,
    ADD COLUMN IF NOT EXISTS internal_regulation_uploaded_at TIMESTAMPTZ;

-- Logo: pública porque é usada como identidade visual nas barras laterais.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'condomit-condominium-logos',
    'condomit-condominium-logos',
    TRUE,
    2097152,
    ARRAY['image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Regulamento: privado. A interface aceita somente .doc e .docx.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'condomit-condominium-regulations',
    'condomit-condominium-regulations',
    FALSE,
    10485760,
    ARRAY[
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "condomit_syndic_upload_condo_logos" ON storage.objects;
CREATE POLICY "condomit_syndic_upload_condo_logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'condomit-condominium-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE LOWER(u.email) = LOWER(auth.email())
          AND LOWER(COALESCE(u.user_type, '')) IN ('sindico', 'síndico')
    )
);

DROP POLICY IF EXISTS "condomit_syndic_update_condo_logos" ON storage.objects;
CREATE POLICY "condomit_syndic_update_condo_logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'condomit-condominium-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'condomit-condominium-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "condomit_syndic_delete_condo_logos" ON storage.objects;
CREATE POLICY "condomit_syndic_delete_condo_logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'condomit-condominium-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "condomit_syndic_upload_condo_regulations" ON storage.objects;
CREATE POLICY "condomit_syndic_upload_condo_regulations"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'condomit-condominium-regulations'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE LOWER(u.email) = LOWER(auth.email())
          AND LOWER(COALESCE(u.user_type, '')) IN ('sindico', 'síndico')
    )
);

DROP POLICY IF EXISTS "condomit_syndic_update_condo_regulations" ON storage.objects;
CREATE POLICY "condomit_syndic_update_condo_regulations"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'condomit-condominium-regulations'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'condomit-condominium-regulations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "condomit_syndic_delete_condo_regulations" ON storage.objects;
CREATE POLICY "condomit_syndic_delete_condo_regulations"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'condomit-condominium-regulations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- O síndico que enviou o documento pode lê-lo novamente.
DROP POLICY IF EXISTS "condomit_syndic_read_own_condo_regulations" ON storage.objects;
CREATE POLICY "condomit_syndic_read_own_condo_regulations"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'condomit-condominium-regulations'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

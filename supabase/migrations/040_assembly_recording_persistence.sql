-- Condomit 0.68.0 - persistência confiável das gravações na Ata
BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_register_assembly_recording_040(
  target_assembly_id BIGINT,
  storage_url_value TEXT,
  livekit_room_name_value TEXT DEFAULT NULL,
  duration_seconds_value INTEGER DEFAULT 0,
  file_size_bytes_value BIGINT DEFAULT NULL,
  started_at_value TIMESTAMPTZ DEFAULT NULL,
  ended_at_value TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := LOWER(COALESCE(public.condomit_auth_email(), ''));
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  assembly_row public.scheduled_assemblies%ROWTYPE;
  saved_row public.assembly_recordings%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO assembly_row
  FROM public.scheduled_assemblies
  WHERE id = target_assembly_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE='22023';
  END IF;

  IF NOT public.condomit_user_belongs_to_cep(assembly_row.cep) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE='42501';
  END IF;

  IF caller_role NOT IN ('sindico','síndico','admin') THEN
    RAISE EXCEPTION 'Somente o síndico/administrador pode registrar a gravação oficial.' USING ERRCODE='42501';
  END IF;

  IF COALESCE(TRIM(storage_url_value), '') NOT LIKE 'storage://condomit-assembly-recordings/%' THEN
    RAISE EXCEPTION 'Endereço da gravação inválido.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.assembly_recordings (
    assembly_id, cep, livekit_room_name, recording_url, recording_type, status,
    duration_seconds, file_size_bytes, started_at, ended_at, started_by
  ) VALUES (
    assembly_row.id, assembly_row.cep, NULLIF(TRIM(livekit_room_name_value), ''),
    TRIM(storage_url_value), 'room_composite', 'concluido',
    GREATEST(0, COALESCE(duration_seconds_value, 0)), file_size_bytes_value,
    COALESCE(started_at_value, NOW()), COALESCE(ended_at_value, NOW()), caller_email
  )
  RETURNING * INTO saved_row;

  RETURN to_jsonb(saved_row);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_register_assembly_recording_040(BIGINT,TEXT,TEXT,INTEGER,BIGINT,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_register_assembly_recording_040(BIGINT,TEXT,TEXT,INTEGER,BIGINT,TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

-- Recria as políticas do bucket para garantir que a pasta da assembleia
-- possa ser escrita pelo síndico/admin do mesmo condomínio.
DROP POLICY IF EXISTS "condomit_assembly_recordings_upload" ON storage.objects;
DROP POLICY IF EXISTS "condomit_assembly_recordings_read" ON storage.objects;
DROP POLICY IF EXISTS "condomit_assembly_recordings_delete" ON storage.objects;

CREATE POLICY "condomit_assembly_recordings_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'condomit-assembly-recordings'
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~ '^[0-9]+$'
      THEN (storage.foldername(name))[1]::BIGINT
      ELSE NULL
    END
    AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

CREATE POLICY "condomit_assembly_recordings_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'condomit-assembly-recordings'
  AND EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~ '^[0-9]+$'
      THEN (storage.foldername(name))[1]::BIGINT
      ELSE NULL
    END
    AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

CREATE POLICY "condomit_assembly_recordings_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'condomit-assembly-recordings'
  AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies sa
    WHERE sa.id = CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~ '^[0-9]+$'
      THEN (storage.foldername(name))[1]::BIGINT
      ELSE NULL
    END
    AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

COMMIT;

-- ============================================================
-- 034 - Ata com assinatura desenhada + comentários encadeados
--       com curtidas/descurtidas
-- ============================================================

-- ------------------------------------------------------------
-- 1. Assinatura desenhada da ata
-- ------------------------------------------------------------
ALTER TABLE public.assembly_minutes_signatures
  ADD COLUMN IF NOT EXISTS signature_data TEXT;

DROP FUNCTION IF EXISTS public.condomit_sign_assembly_minutes(BIGINT);
DROP FUNCTION IF EXISTS public.condomit_sign_assembly_minutes(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.condomit_sign_assembly_minutes(
  target_assembly_id BIGINT,
  target_signature_data TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  caller_name TEXT;
  caller_signature TEXT := NULLIF(BTRIM(COALESCE(target_signature_data, '')), '');
  assembly_row public.scheduled_assemblies%ROWTYPE;
  signature_row public.assembly_minutes_signatures%ROWTYPE;
BEGIN
  IF caller_email = '' OR caller_role NOT IN ('sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode assinar a ata.' USING ERRCODE = '42501';
  END IF;

  SELECT sa.* INTO assembly_row
  FROM public.scheduled_assemblies sa
  WHERE sa.id = target_assembly_id
  LIMIT 1;

  IF assembly_row.id IS NULL THEN
    RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF LOWER(COALESCE(assembly_row.status, '')) NOT IN ('encerrada','finalizada','completed') THEN
    RAISE EXCEPTION 'A ata só pode ser assinada após a assembleia ser finalizada.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
      AND public.condomit_same_cep(uc.condominium_id::TEXT, assembly_row.cep::TEXT)
  ) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.name), ''), caller_email)
    INTO caller_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  caller_name := COALESCE(NULLIF(caller_name, ''), caller_email);

  INSERT INTO public.assembly_minutes_signatures (
    assembly_id,
    cep,
    signer_email,
    signer_name,
    signature_data,
    signed_at
  ) VALUES (
    assembly_row.id,
    assembly_row.cep,
    caller_email,
    caller_name,
    caller_signature,
    NOW()
  )
  ON CONFLICT (assembly_id) DO UPDATE
  SET signer_email = EXCLUDED.signer_email,
      signer_name = EXCLUDED.signer_name,
      signature_data = COALESCE(EXCLUDED.signature_data, public.assembly_minutes_signatures.signature_data),
      signed_at = NOW();

  SELECT s.* INTO signature_row
  FROM public.assembly_minutes_signatures s
  WHERE s.assembly_id = target_assembly_id
  LIMIT 1;

  RETURN to_jsonb(signature_row);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_sign_assembly_minutes(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_sign_assembly_minutes(BIGINT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2. Respostas encadeadas nos comentários da ata
-- ------------------------------------------------------------
ALTER TABLE public.assembly_post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assembly_post_comments_parent_comment_id_fkey'
  ) THEN
    ALTER TABLE public.assembly_post_comments
      ADD CONSTRAINT assembly_post_comments_parent_comment_id_fkey
      FOREIGN KEY (parent_comment_id)
      REFERENCES public.assembly_post_comments(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assembly_post_comments_parent_created
  ON public.assembly_post_comments(assembly_id, parent_comment_id, created_at);

DROP POLICY IF EXISTS assembly_post_comments_insert_policy ON public.assembly_post_comments;
CREATE POLICY assembly_post_comments_insert_policy
ON public.assembly_post_comments
FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(user_email, '')) = public.condomit_auth_email()
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = assembly_post_comments.assembly_id
      AND public.condomit_same_cep(sa.cep, assembly_post_comments.cep)
  )
  AND (
    parent_comment_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.assembly_post_comments parent
      WHERE parent.id = assembly_post_comments.parent_comment_id
        AND parent.assembly_id = assembly_post_comments.assembly_id
        AND public.condomit_same_cep(parent.cep, assembly_post_comments.cep)
    )
  )
);

-- ------------------------------------------------------------
-- 3. Curtidas e descurtidas dos comentários da ata
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assembly_post_comment_votes (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assembly_id BIGINT NOT NULL REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  comment_id BIGINT NOT NULL REFERENCES public.assembly_post_comments(id) ON DELETE CASCADE,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assembly_post_comment_votes_comment_user_key UNIQUE (comment_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_assembly_post_comment_votes_assembly_comment
  ON public.assembly_post_comment_votes(assembly_id, comment_id, vote_type);

ALTER TABLE public.assembly_post_comment_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_post_comment_votes_select_034 ON public.assembly_post_comment_votes;
DROP POLICY IF EXISTS assembly_post_comment_votes_select_052 ON public.assembly_post_comment_votes;
CREATE POLICY assembly_post_comment_votes_select_052
ON public.assembly_post_comment_votes
FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(cep));

REVOKE INSERT, UPDATE, DELETE ON public.assembly_post_comment_votes FROM authenticated;
GRANT SELECT ON public.assembly_post_comment_votes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.assembly_post_comment_votes_id_seq TO authenticated;

DROP FUNCTION IF EXISTS public.condomit_vote_assembly_post_comment(BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.condomit_vote_assembly_post_comment(
  target_comment_id BIGINT,
  target_vote TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  normalized_vote TEXT := LOWER(BTRIM(COALESCE(target_vote, '')));
  comment_row public.assembly_post_comments%ROWTYPE;
  current_row public.assembly_post_comment_votes%ROWTYPE;
  result_vote TEXT := NULL;
  like_count INTEGER := 0;
  dislike_count INTEGER := 0;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  IF normalized_vote NOT IN ('like', 'dislike') THEN
    RAISE EXCEPTION 'Voto inválido para o comentário.' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO comment_row
  FROM public.assembly_post_comments c
  WHERE c.id = target_comment_id
  LIMIT 1;

  IF comment_row.id IS NULL THEN
    RAISE EXCEPTION 'Comentário não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.condomit_user_belongs_to_cep(comment_row.cep) THEN
    RAISE EXCEPTION 'Você não tem acesso a este comentário.' USING ERRCODE = '42501';
  END IF;

  SELECT v.* INTO current_row
  FROM public.assembly_post_comment_votes v
  WHERE v.comment_id = target_comment_id
    AND LOWER(COALESCE(v.user_email, '')) = caller_email
  LIMIT 1;

  IF current_row.id IS NOT NULL AND current_row.vote_type = normalized_vote THEN
    DELETE FROM public.assembly_post_comment_votes
    WHERE id = current_row.id;
    result_vote := NULL;
  ELSE
    INSERT INTO public.assembly_post_comment_votes (
      assembly_id,
      comment_id,
      cep,
      user_email,
      vote_type,
      created_at,
      updated_at
    ) VALUES (
      comment_row.assembly_id,
      comment_row.id,
      comment_row.cep,
      caller_email,
      normalized_vote,
      NOW(),
      NOW()
    )
    ON CONFLICT (comment_id, user_email) DO UPDATE
    SET vote_type = EXCLUDED.vote_type,
        updated_at = NOW();
    result_vote := normalized_vote;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE vote_type = 'like'),
    COUNT(*) FILTER (WHERE vote_type = 'dislike')
  INTO like_count, dislike_count
  FROM public.assembly_post_comment_votes
  WHERE comment_id = comment_row.id;

  RETURN jsonb_build_object(
    'comment_id', comment_row.id,
    'current_vote', result_vote,
    'like_count', like_count,
    'dislike_count', dislike_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_vote_assembly_post_comment(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_vote_assembly_post_comment(BIGINT, TEXT) TO authenticated;

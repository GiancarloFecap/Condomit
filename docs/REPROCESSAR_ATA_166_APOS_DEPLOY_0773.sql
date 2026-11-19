-- OPCIONAL, executar somente APÓS o deploy da versão Condomit v0.77.3.
-- Exclusivamente para a assembleia 166 (Teste Modelo ATA).
-- Não toca atas aprovadas, assinadas ou editadas pelo síndico.
-- A regeneração consome créditos da API Anthropic.
BEGIN;
UPDATE public.assembly_auto_minutes_jobs AS job
SET status='pendente',
    attempts=0,
    locked_until=NULL,
    next_retry_at=NULL,
    last_error=NULL,
    generated_body=NULL,
    saved_to_draft=FALSE,
    source_hash=NULL,
    source_count=0,
    finished_at=NULL,
    progress_completed=0,
    progress_total=0,
    progress_stage='preparando',
    updated_at=NOW()
WHERE job.assembly_id=166
  AND job.status='concluido'
  AND EXISTS (
    SELECT 1 FROM public.assembly_minutes_drafts draft
    WHERE draft.assembly_id=job.assembly_id
      AND draft.status='rascunho'
      AND draft.saved_by='sistema:claude'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.assembly_minutes_signatures signature
    WHERE signature.assembly_id=job.assembly_id
  )
RETURNING assembly_id,status,updated_at;
COMMIT;

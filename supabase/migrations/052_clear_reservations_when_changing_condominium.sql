-- Condomit - Migration 052
-- Quando um usuário realmente muda de condomínio, remove reservas vinculadas
-- ao seu e-mail na mesma transação. A tabela legado `reserva` não possui CEP,
-- portanto as reservas anteriores do usuário são removidas integralmente.
-- Não executa ao editar unidade/bloco no mesmo condomínio ou em falhas de migração.
BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_clear_reservations_on_condominium_change_052()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  previous_cep TEXT;
  next_cep TEXT;
BEGIN
  previous_cep := COALESCE(
    NULLIF(BTRIM(OLD.condominium ->> 'cep'), ''),
    NULLIF(BTRIM(OLD.condominium ->> 'condominium_id'), '')
  );
  next_cep := COALESCE(
    NULLIF(BTRIM(NEW.condominium ->> 'cep'), ''),
    NULLIF(BTRIM(NEW.condominium ->> 'condominium_id'), '')
  );

  IF previous_cep IS NOT NULL
     AND next_cep IS NOT NULL
     AND NOT public.condomit_same_cep(previous_cep, next_cep) THEN
    DELETE FROM public.reserva r
    WHERE LOWER(BTRIM(COALESCE(r.email, ''))) = LOWER(BTRIM(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS condomit_clear_reservations_on_condominium_change_052 ON public.users;
CREATE TRIGGER condomit_clear_reservations_on_condominium_change_052
AFTER UPDATE OF condominium ON public.users
FOR EACH ROW
WHEN (OLD.condominium IS DISTINCT FROM NEW.condominium)
EXECUTE FUNCTION public.condomit_clear_reservations_on_condominium_change_052();

REVOKE ALL ON FUNCTION public.condomit_clear_reservations_on_condominium_change_052() FROM PUBLIC;
COMMIT;

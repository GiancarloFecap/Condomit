-- ============================================================
-- CONDOMIT - MIGRAÇÃO 023
-- Notificação direcionada ao destinatário quando a portaria
-- marca uma encomenda como retirada.
-- Requer a migration 020 aplicada.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_notify_package_pickup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_email TEXT := public.condomit_auth_email();
  actor_name TEXT;
  actor_role TEXT;
  recipient_email TEXT := LOWER(TRIM(COALESCE(NEW.recipient_email, '')));
  package_label TEXT;
BEGIN
  IF NEW.status <> 'Retirada'
     OR COALESCE(OLD.status, '') = 'Retirada' THEN
    RETURN NEW;
  END IF;

  SELECT
    LOWER(COALESCE(u.user_type, '')),
    COALESCE(NULLIF(TRIM(u.name), ''), u.email)
  INTO actor_role, actor_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = actor_email
  LIMIT 1;

  -- O aviso solicitado é disparado especificamente pela portaria.
  IF COALESCE(actor_role, '') <> 'porteiro' THEN
    RETURN NEW;
  END IF;

  IF recipient_email = '' OR recipient_email = actor_email THEN
    RETURN NEW;
  END IF;

  package_label := COALESCE(
    NULLIF(TRIM(NEW.package_description), ''),
    NULLIF(TRIM(NEW.tracking_code), ''),
    'Sua encomenda'
  );

  INSERT INTO public.notifications (
    cep,
    category,
    title,
    description,
    created_by,
    created_by_name,
    event_type,
    recipient_email,
    event_key,
    created_at
  ) VALUES (
    NEW.cep,
    'Entregas',
    'Encomenda retirada',
    package_label || ' foi marcada como retirada na portaria' ||
      CASE
        WHEN actor_name IS NOT NULL THEN ' por ' || actor_name
        ELSE ''
      END || '.',
    actor_email,
    COALESCE(actor_name, actor_email, 'Portaria'),
    'package_picked_up',
    recipient_email,
    'package_picked_up:' || NEW.id::TEXT || ':' || recipient_email,
    COALESCE(NEW.delivered_at, NOW())
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condomit_notify_package_pickup ON public.packages;
CREATE TRIGGER trg_condomit_notify_package_pickup
AFTER UPDATE OF status ON public.packages
FOR EACH ROW
EXECUTE FUNCTION public.condomit_notify_package_pickup();

REVOKE ALL ON FUNCTION public.condomit_notify_package_pickup() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;

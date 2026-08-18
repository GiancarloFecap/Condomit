-- Condomit 028 - exclusão confiável de anúncios do Marketplace

CREATE OR REPLACE FUNCTION public.condomit_delete_marketplace_item(target_item_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_email TEXT := public.condomit_auth_email();
  deleted_count INTEGER := 0;
BEGIN
  IF COALESCE(current_email, '') = '' THEN
    RAISE EXCEPTION 'Sessão inválida para excluir anúncio.';
  END IF;

  DELETE FROM public.marketplace_items mi
  WHERE mi.id = target_item_id
    AND LOWER(COALESCE(mi.seller_email, '')) = LOWER(current_email)
    AND public.condomit_user_belongs_to_cep(mi.cep);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'Anúncio não encontrado ou sem permissão para exclusão.';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_delete_marketplace_item(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_delete_marketplace_item(BIGINT) TO authenticated;

-- Reforça a policy de DELETE para instalações que passaram por migrations antigas.
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_items_delete_policy ON public.marketplace_items;
CREATE POLICY marketplace_items_delete_policy
ON public.marketplace_items
FOR DELETE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(cep)
  AND LOWER(COALESCE(seller_email, '')) = public.condomit_auth_email()
);

GRANT DELETE ON public.marketplace_items TO authenticated;

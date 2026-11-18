BEGIN;

-- Acesso somente de leitura as pautas de assembleias vinculadas ao condominio.
-- Nenhuma linha, gravacao, transcricao ou politica preexistente e modificada.
CREATE POLICY condomit_assembly_agenda_participants_read_057
ON public.assembly_agenda_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies AS assembly
    WHERE assembly.id = assembly_agenda_items.assembly_id
      AND public.condomit_same_cep(assembly.cep, assembly_agenda_items.cep)
      AND public.condomit_user_belongs_to_cep(assembly.cep)
  )
);

COMMIT;

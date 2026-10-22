CREATE TABLE IF NOT EXISTS public.condomit_ai_conversations (
    owner_uid uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id text NOT NULL,
    title text NOT NULL DEFAULT 'Nova conversa',
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_uid, conversation_id),
    CONSTRAINT condomit_ai_conversation_id_length CHECK (char_length(conversation_id) BETWEEN 1 AND 128),
    CONSTRAINT condomit_ai_messages_array CHECK (jsonb_typeof(messages) = 'array')
);
CREATE INDEX IF NOT EXISTS condomit_ai_conversations_recent_idx ON public.condomit_ai_conversations (owner_uid, updated_at DESC);
ALTER TABLE public.condomit_ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.condomit_ai_conversations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.condomit_ai_conversations TO authenticated;
CREATE POLICY condomit_ai_select_060 ON public.condomit_ai_conversations FOR SELECT TO authenticated USING (owner_uid = (select auth.uid()));
CREATE POLICY condomit_ai_insert_060 ON public.condomit_ai_conversations FOR INSERT TO authenticated WITH CHECK (owner_uid = (select auth.uid()));
CREATE POLICY condomit_ai_update_060 ON public.condomit_ai_conversations FOR UPDATE TO authenticated USING (owner_uid = (select auth.uid())) WITH CHECK (owner_uid = (select auth.uid()));
CREATE POLICY condomit_ai_delete_060 ON public.condomit_ai_conversations FOR DELETE TO authenticated USING (owner_uid = (select auth.uid()));

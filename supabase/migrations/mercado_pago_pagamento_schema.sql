-- Migracao: integracao Mercado Pago Checkout Pro
-- Data: 2026-08-01
-- Projeto: Condomit

-- 1) Atualiza tabela pagamento com colunas necessarias para integracao MP
alter table public.pagamento
  add column if not exists external_reference text,
  add column if not exists status_detail text,
  add column if not exists email_usuario text,
  add column if not exists codigo_transacao text,
  add column if not exists data_pagamento timestamptz,
  add column if not exists valor_pago numeric(10,2),
  add column if not exists status_pagamento text default 'pendente',
  add column if not exists plano_id text;

create unique index if not exists
  pagamento_codigo_transacao_unique
on public.pagamento (codigo_transacao);

-- 2) Cria tabela user_plan_status para controle de plano ativo por usuario
create table if not exists public.user_plan_status (
  email text primary key,
  plano_escolhido text not null,
  status text not null default 'ativo',
  atualizado_em timestamptz default now(),
  criado_em timestamptz default now()
);

-- 3) RLS e grants para user_plan_status
alter table public.user_plan_status enable row level security;

drop policy if exists "user_plan_status_select_self" on public.user_plan_status;
create policy "user_plan_status_select_self"
  on public.user_plan_status
  for select
  using (true);

drop policy if exists "user_plan_status_insert_self" on public.user_plan_status;
create policy "user_plan_status_insert_self"
  on public.user_plan_status
  for insert
  with check (true);

drop policy if exists "user_plan_status_update_self" on public.user_plan_status;
create policy "user_plan_status_update_self"
  on public.user_plan_status
  for update
  using (true)
  with check (true);

grant select, insert, update on public.user_plan_status
  to anon, authenticated, service_role;

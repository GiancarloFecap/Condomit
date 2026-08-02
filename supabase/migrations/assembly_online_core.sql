create extension if not exists pgcrypto;

create or replace function public.condomit_current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.condomit_current_user_role()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select lower(u.user_type)
      from public.users u
      where lower(u.email) = public.condomit_current_user_email()
      limit 1
    ),
    ''
  );
$$;

create or replace function public.condomit_current_user_cep()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select uc.condominium_id
      from public.user_condominiums uc
      where lower(uc.user_email) = public.condomit_current_user_email()
      limit 1
    ),
    (
      select coalesce(u.condominium ->> 'cep', u.condominium ->> 'condominium_id', '')
      from public.users u
      where lower(u.email) = public.condomit_current_user_email()
      limit 1
    ),
    ''
  );
$$;

alter table if exists public.scheduled_assemblies
  add column if not exists public_id uuid not null default gen_random_uuid(),
  add column if not exists status text not null default 'agendada',
  add column if not exists livekit_room_name text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduled_assemblies_status_check'
  ) then
    alter table public.scheduled_assemblies
      add constraint scheduled_assemblies_status_check
      check (status in ('agendada', 'em_andamento', 'encerrada', 'cancelada'));
  end if;
end $$;

create unique index if not exists scheduled_assemblies_public_id_key
  on public.scheduled_assemblies (public_id);

create index if not exists scheduled_assemblies_cep_status_date_idx
  on public.scheduled_assemblies (cep, status, date, start_time);

create table if not exists public.assembly_attendance (
  id bigserial primary key,
  assembly_id bigint not null references public.scheduled_assemblies(id) on delete cascade,
  user_email text not null references public.users(email) on delete cascade,
  participant_name text not null,
  participant_role text not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  total_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now()
);

alter table if exists public.assembly_attendance
  add column if not exists assembly_id bigint,
  add column if not exists user_email text,
  add column if not exists participant_name text,
  add column if not exists participant_role text,
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists left_at timestamptz,
  add column if not exists total_seconds integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_heartbeat_at timestamptz not null default now();

create index if not exists assembly_attendance_assembly_joined_idx
  on public.assembly_attendance (assembly_id, joined_at desc);

create index if not exists assembly_attendance_user_idx
  on public.assembly_attendance (user_email, assembly_id);

create table if not exists public.assembly_chat_messages (
  id bigserial primary key,
  assembly_id bigint not null references public.scheduled_assemblies(id) on delete cascade,
  user_email text not null references public.users(email) on delete cascade,
  participant_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint assembly_chat_messages_message_length check (char_length(message) between 1 and 2000)
);

alter table if exists public.assembly_chat_messages
  add column if not exists assembly_id bigint,
  add column if not exists user_email text,
  add column if not exists participant_name text,
  add column if not exists message text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assembly_chat_messages_message_length'
  ) then
    alter table public.assembly_chat_messages
      add constraint assembly_chat_messages_message_length
      check (char_length(message) between 1 and 2000);
  end if;
end $$;

create index if not exists assembly_chat_messages_assembly_created_idx
  on public.assembly_chat_messages (assembly_id, created_at desc);

create table if not exists public.assembly_speaking_requests (
  id bigserial primary key,
  assembly_id bigint not null references public.scheduled_assemblies(id) on delete cascade,
  user_email text not null references public.users(email) on delete cascade,
  participant_name text not null,
  status text not null default 'aguardando',
  requested_at timestamptz not null default now(),
  answered_at timestamptz,
  constraint assembly_speaking_requests_status_check
    check (status in ('aguardando', 'autorizado', 'recusado', 'finalizado'))
);

alter table if exists public.assembly_speaking_requests
  add column if not exists assembly_id bigint,
  add column if not exists user_email text,
  add column if not exists participant_name text,
  add column if not exists status text not null default 'aguardando',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists answered_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assembly_speaking_requests_status_check'
  ) then
    alter table public.assembly_speaking_requests
      add constraint assembly_speaking_requests_status_check
      check (status in ('aguardando', 'autorizado', 'recusado', 'finalizado'));
  end if;
end $$;

create unique index if not exists assembly_speaking_requests_waiting_unique
  on public.assembly_speaking_requests (assembly_id, user_email)
  where status = 'aguardando';

create index if not exists assembly_speaking_requests_assembly_status_idx
  on public.assembly_speaking_requests (assembly_id, status, requested_at);

create table if not exists public.assembly_polls (
  id bigserial primary key,
  assembly_id bigint not null references public.scheduled_assemblies(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'aberta',
  created_by text not null references public.users(email) on delete restrict,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint assembly_polls_status_check
    check (status in ('aberta', 'encerrada', 'cancelada')),
  constraint assembly_polls_title_length check (char_length(title) between 3 and 255)
);

alter table if exists public.assembly_polls
  add column if not exists assembly_id bigint,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists status text not null default 'aberta',
  add column if not exists created_by text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assembly_polls_status_check'
  ) then
    alter table public.assembly_polls
      add constraint assembly_polls_status_check
      check (status in ('aberta', 'encerrada', 'cancelada'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'assembly_polls_title_length'
  ) then
    alter table public.assembly_polls
      add constraint assembly_polls_title_length
      check (char_length(title) between 3 and 255);
  end if;
end $$;

create index if not exists assembly_polls_assembly_status_idx
  on public.assembly_polls (assembly_id, status, created_at desc);

create table if not exists public.assembly_poll_options (
  id bigserial primary key,
  poll_id bigint not null references public.assembly_polls(id) on delete cascade,
  option_text text not null,
  display_order integer not null default 0,
  constraint assembly_poll_options_text_length check (char_length(option_text) between 1 and 255)
);

alter table if exists public.assembly_poll_options
  add column if not exists poll_id bigint,
  add column if not exists option_text text,
  add column if not exists display_order integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assembly_poll_options_text_length'
  ) then
    alter table public.assembly_poll_options
      add constraint assembly_poll_options_text_length
      check (char_length(option_text) between 1 and 255);
  end if;
end $$;

create index if not exists assembly_poll_options_poll_order_idx
  on public.assembly_poll_options (poll_id, display_order, id);

create table if not exists public.assembly_votes (
  id bigserial primary key,
  poll_id bigint not null references public.assembly_polls(id) on delete cascade,
  assembly_id bigint not null references public.scheduled_assemblies(id) on delete cascade,
  user_email text not null references public.users(email) on delete cascade,
  option_id bigint not null references public.assembly_poll_options(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table if exists public.assembly_votes
  add column if not exists poll_id bigint,
  add column if not exists assembly_id bigint,
  add column if not exists user_email text,
  add column if not exists option_id bigint,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists assembly_votes_poll_user_unique
  on public.assembly_votes (poll_id, user_email);

create index if not exists assembly_votes_assembly_idx
  on public.assembly_votes (assembly_id, poll_id, created_at desc);

create table if not exists public.assembly_event_logs (
  id bigserial primary key,
  assembly_id bigint not null references public.scheduled_assemblies(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

alter table if exists public.assembly_event_logs
  add column if not exists assembly_id bigint,
  add column if not exists event_type text,
  add column if not exists event_payload jsonb not null default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists assembly_event_logs_assembly_type_idx
  on public.assembly_event_logs (assembly_id, event_type, created_at desc);

alter table public.scheduled_assemblies enable row level security;
alter table public.assembly_attendance enable row level security;
alter table public.assembly_chat_messages enable row level security;
alter table public.assembly_speaking_requests enable row level security;
alter table public.assembly_polls enable row level security;
alter table public.assembly_poll_options enable row level security;
alter table public.assembly_votes enable row level security;
alter table public.assembly_event_logs enable row level security;

drop policy if exists scheduled_assemblies_select_same_condo on public.scheduled_assemblies;
create policy scheduled_assemblies_select_same_condo
  on public.scheduled_assemblies
  for select
  to authenticated
  using (cep = public.condomit_current_user_cep());

drop policy if exists scheduled_assemblies_insert_sindico on public.scheduled_assemblies;
create policy scheduled_assemblies_insert_sindico
  on public.scheduled_assemblies
  for insert
  to authenticated
  with check (
    cep = public.condomit_current_user_cep()
    and public.condomit_current_user_role() = 'sindico'
    and lower(created_by) = public.condomit_current_user_email()
  );

drop policy if exists scheduled_assemblies_update_sindico on public.scheduled_assemblies;
create policy scheduled_assemblies_update_sindico
  on public.scheduled_assemblies
  for update
  to authenticated
  using (
    cep = public.condomit_current_user_cep()
    and public.condomit_current_user_role() = 'sindico'
  )
  with check (
    cep = public.condomit_current_user_cep()
    and public.condomit_current_user_role() = 'sindico'
  );

drop policy if exists assembly_attendance_select_same_condo on public.assembly_attendance;
create policy assembly_attendance_select_same_condo
  on public.assembly_attendance
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_attendance.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_chat_messages_select_same_condo on public.assembly_chat_messages;
create policy assembly_chat_messages_select_same_condo
  on public.assembly_chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_chat_messages.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_chat_messages_insert_same_user on public.assembly_chat_messages;
create policy assembly_chat_messages_insert_same_user
  on public.assembly_chat_messages
  for insert
  to authenticated
  with check (
    lower(user_email) = public.condomit_current_user_email()
    and exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_chat_messages.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_speaking_requests_select_same_condo on public.assembly_speaking_requests;
create policy assembly_speaking_requests_select_same_condo
  on public.assembly_speaking_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_speaking_requests.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_speaking_requests_insert_same_user on public.assembly_speaking_requests;
create policy assembly_speaking_requests_insert_same_user
  on public.assembly_speaking_requests
  for insert
  to authenticated
  with check (
    lower(user_email) = public.condomit_current_user_email()
    and exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_speaking_requests.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_speaking_requests_update_sindico_or_owner on public.assembly_speaking_requests;
create policy assembly_speaking_requests_update_sindico_or_owner
  on public.assembly_speaking_requests
  for update
  to authenticated
  using (
    lower(user_email) = public.condomit_current_user_email()
    or (
      public.condomit_current_user_role() = 'sindico'
      and exists (
        select 1
        from public.scheduled_assemblies sa
        where sa.id = assembly_speaking_requests.assembly_id
          and sa.cep = public.condomit_current_user_cep()
      )
    )
  )
  with check (
    lower(user_email) = public.condomit_current_user_email()
    or public.condomit_current_user_role() = 'sindico'
  );

drop policy if exists assembly_polls_select_same_condo on public.assembly_polls;
create policy assembly_polls_select_same_condo
  on public.assembly_polls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_polls.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_polls_insert_sindico on public.assembly_polls;
create policy assembly_polls_insert_sindico
  on public.assembly_polls
  for insert
  to authenticated
  with check (
    public.condomit_current_user_role() = 'sindico'
    and lower(created_by) = public.condomit_current_user_email()
    and exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_polls.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_polls_update_sindico on public.assembly_polls;
create policy assembly_polls_update_sindico
  on public.assembly_polls
  for update
  to authenticated
  using (
    public.condomit_current_user_role() = 'sindico'
    and exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_polls.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  )
  with check (public.condomit_current_user_role() = 'sindico');

drop policy if exists assembly_poll_options_select_same_condo on public.assembly_poll_options;
create policy assembly_poll_options_select_same_condo
  on public.assembly_poll_options
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assembly_polls ap
      join public.scheduled_assemblies sa on sa.id = ap.assembly_id
      where ap.id = assembly_poll_options.poll_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_poll_options_insert_sindico on public.assembly_poll_options;
create policy assembly_poll_options_insert_sindico
  on public.assembly_poll_options
  for insert
  to authenticated
  with check (
    public.condomit_current_user_role() = 'sindico'
    and exists (
      select 1
      from public.assembly_polls ap
      join public.scheduled_assemblies sa on sa.id = ap.assembly_id
      where ap.id = assembly_poll_options.poll_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_votes_select_same_condo on public.assembly_votes;
create policy assembly_votes_select_same_condo
  on public.assembly_votes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_votes.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_votes_insert_eligible on public.assembly_votes;
create policy assembly_votes_insert_eligible
  on public.assembly_votes
  for insert
  to authenticated
  with check (
    lower(user_email) = public.condomit_current_user_email()
    and public.condomit_current_user_role() in ('morador', 'sindico')
    and exists (
      select 1
      from public.assembly_polls ap
      join public.scheduled_assemblies sa on sa.id = ap.assembly_id
      where ap.id = assembly_votes.poll_id
        and ap.status = 'aberta'
        and sa.id = assembly_votes.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

drop policy if exists assembly_event_logs_select_same_condo on public.assembly_event_logs;
create policy assembly_event_logs_select_same_condo
  on public.assembly_event_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduled_assemblies sa
      where sa.id = assembly_event_logs.assembly_id
        and sa.cep = public.condomit_current_user_cep()
    )
  );

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'assembly_chat_messages'
    ) then
      alter publication supabase_realtime add table public.assembly_chat_messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'assembly_speaking_requests'
    ) then
      alter publication supabase_realtime add table public.assembly_speaking_requests;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'assembly_polls'
    ) then
      alter publication supabase_realtime add table public.assembly_polls;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'assembly_poll_options'
    ) then
      alter publication supabase_realtime add table public.assembly_poll_options;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'assembly_votes'
    ) then
      alter publication supabase_realtime add table public.assembly_votes;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'assembly_attendance'
    ) then
      alter publication supabase_realtime add table public.assembly_attendance;
    end if;
  end if;
end $$;

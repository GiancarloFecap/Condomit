alter table public.scheduled_assemblies
add column if not exists public_id uuid default gen_random_uuid(),
add column if not exists status text not null default 'agendada',
add column if not exists livekit_room_name text,
add column if not exists started_at timestamptz,
add column if not exists ended_at timestamptz,
add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'scheduled_assemblies_status_check'
    ) then
        alter table public.scheduled_assemblies
        add constraint scheduled_assemblies_status_check
        check (
            status in (
                'agendada',
                'em_andamento',
                'encerrada',
                'cancelada'
            )
        );
    end if;
end $$;

create unique index if not exists
scheduled_assemblies_public_id_unique
on public.scheduled_assemblies(public_id);

create unique index if not exists
scheduled_assemblies_livekit_room_unique
on public.scheduled_assemblies(livekit_room_name)
where livekit_room_name is not null;
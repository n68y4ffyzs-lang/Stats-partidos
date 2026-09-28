-- PASO 1 · Tablas nuevas por cuenta (email + contraseña) — Statix
--
-- Crea dos tablas NUEVAS y vacías. No toca las tablas antiguas (registro_partido_data y
-- registro_partido_history) ni ninguno de sus datos: la app actual sigue funcionando igual.
--
-- Reglas (RLS):
--   · Solo usuarios con sesión iniciada (rol "authenticated") pueden acceder.
--   · Cada usuario solo puede leer, crear, modificar o borrar SU fila (user_id = auth.uid()).
--   · Sin sesión (rol "anon") no hay ninguna política: no se puede leer ni escribir nada.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar todo este archivo → Run.
-- Se puede ejecutar más de una vez sin problema.

create table if not exists public.statix_user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  device_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.statix_user_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  device_id text,
  created_at timestamptz not null default now()
);

create index if not exists statix_user_history_user_created
  on public.statix_user_history (user_id, created_at desc);

alter table public.statix_user_data enable row level security;
alter table public.statix_user_history enable row level security;

-- Nada para anon: se le retiran también los permisos de tabla, por si acaso
revoke all on public.statix_user_data from anon;
revoke all on public.statix_user_history from anon;
grant select, insert, update, delete on public.statix_user_data to authenticated;
grant select, insert, delete on public.statix_user_history to authenticated;

drop policy if exists "cuenta_propia" on public.statix_user_data;
create policy "cuenta_propia" on public.statix_user_data
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "cuenta_propia" on public.statix_user_history;
create policy "cuenta_propia" on public.statix_user_history
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Tiempo real entre dispositivos de la misma cuenta (respeta las reglas de arriba)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'statix_user_data'
  ) then
    alter publication supabase_realtime add table public.statix_user_data;
  end if;
end $$;

-- Comprobación (debe devolver 2 filas con rowsecurity = true):
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('statix_user_data', 'statix_user_history');

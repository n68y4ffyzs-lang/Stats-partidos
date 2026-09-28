-- Aislamiento por equipo en Supabase (Statix)
--
-- Hasta ahora las tablas tenían una política "to anon using (true)": cualquiera con la URL y
-- la anon key del proyecto podía leer las filas de TODOS los equipos pidiéndolas sin filtro
-- (la app filtra por team_code, pero eso no lo impide otra herramienta).
--
-- Con esto, Supabase solo deja leer y escribir la fila cuyo team_code coincide con la
-- cabecera x-team-code que manda la app (desde la versión que añade este archivo). Para ver
-- los datos de un equipo hay que conocer su código, igual que en la app.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar todo este archivo → Run. Se puede ejecutar
-- más de una vez sin problema.
--
-- Efecto secundario: el "tiempo real" (avisos instantáneos entre dispositivos) deja de llegar,
-- porque no lleva esa cabecera. La app ya lo compensa comprobando la nube cada 30 segundos y
-- al volver a la app, así que los cambios entre iPad y ordenador tardan como mucho eso.
--
-- Para deshacerlo: ejecutar el bloque "VOLVER ATRÁS" del final.

-- Código de equipo que manda la app en la cabecera x-team-code ('' si no hay)
create or replace function public.statix_request_team_code()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code',
    ''
  );
$$;

-- Quita las políticas anteriores (las permisivas) de las dos tablas
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('registro_partido_data', 'registro_partido_history')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.registro_partido_data enable row level security;
alter table public.registro_partido_history enable row level security;

create policy "solo_mi_equipo" on public.registro_partido_data
  for all to anon
  using (team_code <> '' and team_code = public.statix_request_team_code())
  with check (team_code <> '' and team_code = public.statix_request_team_code());

create policy "solo_mi_equipo" on public.registro_partido_history
  for all to anon
  using (team_code <> '' and team_code = public.statix_request_team_code())
  with check (team_code <> '' and team_code = public.statix_request_team_code());

-- ---------------------------------------------------------------------------------------
-- VOLVER ATRÁS (solo si hiciera falta): deja las tablas como estaban, abiertas a la anon key.
--
-- drop policy if exists "solo_mi_equipo" on public.registro_partido_data;
-- drop policy if exists "solo_mi_equipo" on public.registro_partido_history;
-- create policy "anon_all" on public.registro_partido_data for all to anon using (true) with check (true);
-- create policy "anon_all" on public.registro_partido_history for all to anon using (true) with check (true);

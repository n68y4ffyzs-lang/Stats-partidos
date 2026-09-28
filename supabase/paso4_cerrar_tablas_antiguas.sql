-- PASO 4 · Cerrar las tablas antiguas por código de equipo — Statix
--
-- EJECUTAR SOLO cuando hayas comprobado que tus datos ya están en tu cuenta en el iPad y en
-- el ordenador, y tengas la copia de seguridad JSON descargada.
--
-- No borra ningún dato: solo quita las reglas que permitían leer y escribir esas tablas sin
-- sesión. A partir de aquí nadie puede acceder a ellas desde la app ni con la anon key (solo
-- tú desde el panel de Supabase). La opción "Traer datos de tu código de equipo antiguo" de
-- la app dejará de encontrar datos en la nube.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar → Run. Para deshacerlo, bloque del final.

do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('registro_partido_data', 'registro_partido_history')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.registro_partido_data enable row level security;
alter table public.registro_partido_history enable row level security;
revoke all on public.registro_partido_data from anon, authenticated;
revoke all on public.registro_partido_history from anon, authenticated;

-- Comprobación: no debe devolver ninguna fila
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('registro_partido_data', 'registro_partido_history');

-- DESHACER (solo si hiciera falta):
-- grant all on public.registro_partido_data to anon;
-- grant all on public.registro_partido_history to anon;
-- create policy "anon_all" on public.registro_partido_data for all to anon using (true) with check (true);
-- create policy "anon_all" on public.registro_partido_history for all to anon using (true) with check (true);

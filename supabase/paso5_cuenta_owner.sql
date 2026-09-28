-- PASO 5 · Marcar la cuenta del administrador como "owner" — Statix
--
-- Todas las cuentas son "client" por defecto: en Ajustes solo ven su cuenta y la tabla de
-- puntuación. La cuenta "owner" ve además todo lo técnico (conexión, copias de seguridad,
-- forzar sincronización, histórico, traer datos antiguos, Mi equipo).
--
-- El tipo se guarda en app_metadata, que solo se puede cambiar desde aquí (SQL / panel de
-- Supabase), nunca desde la app. Solo decide qué se ve en Ajustes; los datos de cada cuenta
-- los protegen las reglas RLS (paso 1).
--
-- Cómo aplicarlo: cambia TU_EMAIL@ejemplo.com por el email de tu cuenta de Statix, pégalo en
-- Supabase → SQL Editor → Run. Después cierra y vuelve a abrir la app (con conexión).

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"account_type": "owner"}'::jsonb
where email = 'TU_EMAIL@ejemplo.com';

-- Comprobación: debe salir tu email con account_type = owner
select email, raw_app_meta_data ->> 'account_type' as account_type
from auth.users
where raw_app_meta_data ->> 'account_type' = 'owner';

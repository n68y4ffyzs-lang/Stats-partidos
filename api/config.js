// Conexión con Supabase para las cuentas nuevas, sin que el entrenador tenga que pegar nada:
// la app la pide aquí si el dispositivo no tiene una guardada. Los valores salen de las
// variables de entorno de Vercel (Settings → Environment Variables):
//   SUPABASE_URL       → Project URL
//   SUPABASE_ANON_KEY  → anon public key
// La anon key es pública por diseño; lo que protege los datos son las reglas RLS por cuenta
// (supabase/paso1_cuentas.sql). Mientras no estén configuradas, responde vacío y la app sigue
// pidiendo la conexión a mano en Ajustes, como hasta ahora.

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(/^https:\/\//.test(url) && anonKey ? { url, anonKey } : {});
};

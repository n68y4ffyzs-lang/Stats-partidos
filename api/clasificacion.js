// Proxy no oficial hacia la API interna de resultados de la FFCV (ffcv.es/competiciones).
// Existe para evitar el bloqueo CORS del navegador (la FFCV solo permite peticiones
// desde su propio dominio) y para esconder los reintentos que hacen falta por la
// inestabilidad de su backend ("Novanet"), que a veces responde con errores
// temporales que hay que reintentar.
//
// No es una API oficial ni documentada por la FFCV: puede dejar de funcionar o
// cambiar de forma sin aviso.

const FFCV_BASE = "https://ffcv.es/competiciones/api";
const FFCV_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RegistroPartidoApp/1.0)",
  Referer: "https://ffcv.es/competiciones/",
};

// Grupo de liga por defecto: Primera Cadet (Futbol-11), Grup - 1, temporada 2026-2027.
// La FFCV crea un cod_grupo nuevo cada temporada: actualizar este código a principios
// de cada temporada (o si el equipo cambia de grupo o categoría).
const DEFAULT_COD_GRUPO = "905431893";

async function fetchJsonWithRetry(url, attempts = 4, delayMs = 900) {
  let lastError = "No se pudo obtener respuesta de la FFCV";
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: FFCV_HEADERS });
      const data = await r.json();
      if (data && (Array.isArray(data.clasificacion) || Array.isArray(data.jornadas) || data.estado === "1")) {
        return data;
      }
      lastError = (data && data.error) || "Respuesta inesperada de la FFCV";
    } catch (e) {
      lastError = e.message || lastError;
    }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error(lastError);
}

function parseSpanishDate(str) {
  const parts = String(str || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !n)) return null;
  const [d, m, y] = parts;
  return new Date(y, m - 1, d);
}

async function resolveCurrentJornada(codGrupo) {
  const data = await fetchJsonWithRetry(`${FFCV_BASE}/filtros/jornadas_fetch.php?cod_grupo=${codGrupo}`);
  const jornadas = Array.isArray(data.jornadas) ? data.jornadas : [];
  if (jornadas.length === 0) return 1;
  const now = new Date();
  let best = jornadas[0];
  for (const j of jornadas) {
    const fecha = parseSpanishDate(j.fecha_jornada);
    if (fecha && fecha <= now) best = j;
  }
  return Number(best.codjornada) || 1;
}

module.exports = async (req, res) => {
  try {
    const codGrupo = (req.query && req.query.cod_grupo) || DEFAULT_COD_GRUPO;
    let codJornada = req.query && req.query.cod_jornada ? Number(req.query.cod_jornada) : null;

    if (!codJornada) {
      codJornada = await resolveCurrentJornada(codGrupo);
    }

    const data = await fetchJsonWithRetry(
      `${FFCV_BASE}/clasificaciones/clasificaciones_ajax.php?cod_grupo=${codGrupo}&cod_jornada=${codJornada}`
    );

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    res.status(200).json({
      competicion: data.competicion,
      grupo: data.grupo,
      jornada: data.jornada,
      fecha_jornada: data.fecha_jornada,
      clasificacion: (data.clasificacion || []).map((r) => ({
        posicion: Number(r.posicion),
        codequipo: String(r.codequipo),
        nombre: r.nombre,
        jugados: Number(r.jugados),
        ganados: Number(r.ganados),
        empatados: Number(r.empatados),
        perdidos: Number(r.perdidos),
        goles_a_favor: Number(r.goles_a_favor),
        goles_en_contra: Number(r.goles_en_contra),
        puntos: Number(r.puntos),
      })),
    });
  } catch (e) {
    res.status(502).json({ error: e.message || "No se pudo obtener la clasificación de la FFCV" });
  }
};

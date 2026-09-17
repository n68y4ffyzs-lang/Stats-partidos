// Proxy no oficial hacia la API interna de resultados de la FFCV (ffcv.es/competiciones)
// que devuelve el calendario completo (todas las jornadas) de un equipo concreto:
// fecha, rival y si se juega como local o visitante. Recorre las jornadas del grupo
// en paralelo para no depender de que cada llamada a la FFCV responda rápido.
//
// No es una API oficial ni documentada por la FFCV: puede dejar de funcionar o
// cambiar de forma sin aviso.

const FFCV_BASE = "https://ffcv.es/competiciones/api";
const FFCV_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RegistroPartidoApp/1.0)",
  Referer: "https://ffcv.es/competiciones/",
};

// Grupo y equipo por defecto: Primera Cadet (Futbol-11), Grup - 1, temporada 2026-2027,
// C.F. Nou Jove Castelló 'A'. Actualizar cada temporada si hace falta.
const DEFAULT_COD_GRUPO = "905431893";
const DEFAULT_COD_EQUIPO = "903635134";

const config = { maxDuration: 30 };

async function fetchJsonWithRetry(url, attempts = 3, delayMs = 700) {
  let lastError = "No se pudo obtener respuesta de la FFCV";
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: FFCV_HEADERS });
      const data = await r.json();
      if (data && (Array.isArray(data.partidos) || Array.isArray(data.jornadas) || data.estado === "1")) {
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

function ddmmyyyyToIso(str) {
  const parts = String(str || "").split("/").map(Number);
  if (parts.length !== 3 || parts.some((n) => !n)) return null;
  const [d, m, y] = parts;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

module.exports = async (req, res) => {
  try {
    const codGrupo = (req.query && req.query.cod_grupo) || DEFAULT_COD_GRUPO;
    const codEquipo = String((req.query && req.query.cod_equipo) || DEFAULT_COD_EQUIPO);

    const jornadasData = await fetchJsonWithRetry(`${FFCV_BASE}/filtros/jornadas_fetch.php?cod_grupo=${codGrupo}`);
    const jornadas = Array.isArray(jornadasData.jornadas) ? jornadasData.jornadas : [];

    const perJornada = await Promise.all(
      jornadas.map(async (j) => {
        try {
          const data = await fetchJsonWithRetry(
            `${FFCV_BASE}/partidos/resultados_por_grupo_jornada_data.php?cod_grupo=${codGrupo}&cod_jornada=${j.codjornada}`
          );
          const partidos = Array.isArray(data.partidos) ? data.partidos : [];
          return partidos
            .filter((p) => String(p.cod_equipo_local) === codEquipo || String(p.cod_equipo_visitante) === codEquipo)
            .map((p) => {
              const isHome = String(p.cod_equipo_local) === codEquipo;
              return {
                jornada: Number(j.codjornada),
                date: ddmmyyyyToIso(p.fecha),
                hora: p.hora || null,
                opponent: isHome ? p.visitante : p.local,
                isHome,
                campo: p.campo || null,
              };
            });
        } catch (e) {
          return [];
        }
      })
    );

    const fixtures = perJornada
      .flat()
      .filter((f) => f.date && f.opponent)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json({ codGrupo, codEquipo, fixtures });
  } catch (e) {
    res.status(502).json({ error: e.message || "No se pudo obtener el calendario de la FFCV" });
  }
};
module.exports.config = config;

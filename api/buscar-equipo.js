// Proxy no oficial hacia la API interna de la FFCV (ffcv.es/competiciones) para que un
// entrenador encuentre su equipo escribiendo el nombre, sin saber ningún código.
//
//   GET /api/buscar-equipo?q=nou jove
//     → { temporada, equipos: [{ codequipo, nombre, club, categoria, codigoCategoria, escudo }] }
//     Busca clubes por nombre y devuelve sus equipos que están en competición esta temporada.
//
//   GET /api/buscar-equipo?codequipo=903635134&categoria=7812
//     → { codGrupo, grupo, competicion, halfLength }
//     Averigua el grupo de liga del equipo: competiciones de su categoría → grupos → el grupo
//     en cuyos partidos aparece el equipo. halfLength = minutos de juego / número de partes.
//
// No es una API oficial ni documentada por la FFCV: puede dejar de funcionar o cambiar sin aviso.

const FFCV_BASE = "https://ffcv.es/competiciones/api";
const FFCV_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RegistroPartidoApp/1.0)",
  Referer: "https://ffcv.es/competiciones/",
};

const config = { maxDuration: 30 };

async function fetchJsonWithRetry(url, attempts = 3, delayMs = 700) {
  let lastError = "No se pudo obtener respuesta de la FFCV";
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: FFCV_HEADERS });
      const data = await r.json();
      // Los filtros traen estado "1"; los resultados de una jornada no, pero sí la lista de partidos
      if (data && (data.estado === "1" || Array.isArray(data.partidos))) return data;
      lastError = (data && (data.reason || data.error)) || "Respuesta inesperada de la FFCV";
    } catch (e) {
      lastError = e.message || lastError;
    }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error(lastError);
}

// Temporada en curso según sus fechas (si ninguna encaja, la más reciente)
async function currentSeason() {
  const data = await fetchJsonWithRetry(`${FFCV_BASE}/filtros/temporadas_fetch.php`);
  const list = Array.isArray(data.temporadas) ? data.temporadas : [];
  const today = new Date().toISOString().slice(0, 10);
  const current = list.find((t) => t.fecha_inicio <= today && today <= t.fecha_fin) || list[0];
  if (!current) throw new Error("La FFCV no devolvió temporadas");
  return current;
}

function normalize(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// De pocas en pocas para no saturar a la FFCV
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function searchTeams(q) {
  const season = await currentSeason();
  const clubsData = await fetchJsonWithRetry(
    `${FFCV_BASE}/clubes/ajax_clubes.php?nclub=${encodeURIComponent(q)}&NPcd_PageLines=20&NPcd_Page=1`
  );
  const clubs = (Array.isArray(clubsData.clubes) ? clubsData.clubes : []).slice(0, 6);
  const perClub = await inBatches(clubs, 3, async (club) => {
    try {
      const data = await fetchJsonWithRetry(
        `${FFCV_BASE}/clubes/ajax_club_equipos.php?clave=${encodeURIComponent(club.clave_acceso)}&cod_temporada=${encodeURIComponent(season.cod_temporada)}`
      );
      return (Array.isArray(data.equipos) ? data.equipos : []).filter((e) => String(e.en_competicion) === "1");
    } catch (e) {
      return [];
    }
  });
  const words = normalize(q).split(/\s+/).filter(Boolean);
  const teams = perClub.flat().map((e) => ({
    codequipo: String(e.codequipo),
    nombre: String(e.nombre_equipo || "").trim(),
    club: String(e.nombre_club || "").trim(),
    categoria: String(e.categoria || "").trim(),
    codigoCategoria: String(e.codigo_categoria || ""),
    escudo: e.escudo || null,
  }));
  // Primero los que contienen todas las palabras buscadas en su nombre
  const score = (t) => words.filter((w) => normalize(t.nombre).includes(w)).length;
  teams.sort((a, b) => score(b) - score(a) || a.club.localeCompare(b.club) || a.categoria.localeCompare(b.categoria));
  return { temporada: season.nombre, equipos: teams.slice(0, 80) };
}

async function findTeamGroup(codEquipo, codCategoria) {
  const season = await currentSeason();
  const compsData = await fetchJsonWithRetry(
    `${FFCV_BASE}/filtros/competiciones_fetch.php?temporada=${encodeURIComponent(season.cod_temporada)}`
  );
  const comps = (Array.isArray(compsData.competiciones) ? compsData.competiciones : []).filter(
    (c) => String(c.CodigoCategoria) === String(codCategoria)
  );
  const groups = (
    await inBatches(comps, 3, async (comp) => {
      try {
        const g = await fetchJsonWithRetry(`${FFCV_BASE}/filtros/grupos_fetch.php?cod_competicion=${encodeURIComponent(comp.codigo)}`);
        return (Array.isArray(g.grupos) ? g.grupos : []).map((grp) => ({ grp, comp }));
      } catch (e) {
        return [];
      }
    })
  ).flat();

  // ¿Juega el equipo en la jornada `index` de este grupo? (si descansa en la 1ª, se mira la 2ª)
  const playsIn = async ({ grp }, index) => {
    try {
      const j = await fetchJsonWithRetry(`${FFCV_BASE}/filtros/jornadas_fetch.php?cod_grupo=${encodeURIComponent(grp.codigo)}`);
      const jornada = (Array.isArray(j.jornadas) ? j.jornadas : [])[index];
      if (!jornada) return false;
      const p = await fetchJsonWithRetry(
        `${FFCV_BASE}/partidos/resultados_por_grupo_jornada_data.php?cod_grupo=${encodeURIComponent(grp.codigo)}&cod_jornada=${encodeURIComponent(jornada.codjornada)}`
      );
      return (Array.isArray(p.partidos) ? p.partidos : []).some(
        (m) => String(m.cod_equipo_local) === String(codEquipo) || String(m.cod_equipo_visitante) === String(codEquipo)
      );
    } catch (e) {
      return false;
    }
  };

  for (const index of [0, 1]) {
    const hits = await inBatches(groups, 4, async (g) => ((await playsIn(g, index)) ? g : null));
    const found = hits.find(Boolean);
    if (found) {
      const minutes = Number(found.comp.minutos_juego) || 0;
      const parts = Number(found.comp.numero_partes) || 2;
      return {
        codGrupo: String(found.grp.codigo),
        grupo: found.grp.nombre,
        competicion: found.comp.nombre,
        halfLength: minutes && parts ? Math.round(minutes / parts) : null,
      };
    }
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    const q = String((req.query && req.query.q) || "").trim();
    const codEquipo = String((req.query && req.query.codequipo) || "");
    const codCategoria = String((req.query && req.query.categoria) || "");

    if (codEquipo) {
      if (!/^\d+$/.test(codEquipo) || !/^\d+$/.test(codCategoria)) {
        res.status(400).json({ error: "Faltan el equipo o su categoría" });
        return;
      }
      const group = await findTeamGroup(codEquipo, codCategoria);
      if (!group) {
        res.status(404).json({ error: "No se ha encontrado el grupo de liga de ese equipo en la FFCV" });
        return;
      }
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
      res.status(200).json(group);
      return;
    }

    if (q.length < 3) {
      res.status(400).json({ error: "Escribe al menos 3 letras del nombre de tu equipo" });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(await searchTeams(q));
  } catch (e) {
    res.status(502).json({ error: e.message || "No se pudo consultar la FFCV" });
  }
};

module.exports.config = config;

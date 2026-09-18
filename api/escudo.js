// Proxy no oficial de las imágenes de escudos de la FFCV (appwebffcv.novanet.es).
// Existe porque ese servidor no envía cabeceras CORS y el navegador no podría leer
// la imagen para reducirla y guardarla. Solo sirve rutas /pnfg/... de ese dominio.
//
// No es una API oficial ni documentada por la FFCV: puede dejar de funcionar o
// cambiar de forma sin aviso.

const FFCV_IMG_BASE = "https://appwebffcv.novanet.es";
const FFCV_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RegistroPartidoApp/1.0)",
  Referer: "https://ffcv.es/competiciones/",
};
const MAX_BYTES = 4 * 1024 * 1024; // Vercel limita la respuesta a ~4,5 MB

module.exports = async (req, res) => {
  try {
    const path = req.query && req.query.p;
    if (typeof path !== "string" || !path.startsWith("/pnfg/") || path.includes("..")) {
      res.status(400).json({ error: "Ruta de escudo no válida" });
      return;
    }
    const r = await fetch(`${FFCV_IMG_BASE}${path}`, { headers: FFCV_HEADERS });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) {
      res.status(502).json({ error: "La FFCV no devolvió una imagen" });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.status(502).json({ error: "El escudo es demasiado grande" });
      return;
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: e.message || "No se pudo obtener el escudo de la FFCV" });
  }
};

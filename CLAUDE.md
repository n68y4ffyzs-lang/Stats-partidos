# RegistroPartido

App standalone (`index.html`, React vía CDN + Babel standalone) para registrar eventos de partidos de fútbol. Sincroniza datos entre dispositivos vía Supabase (ver "Sincronización" en la app). Desplegada en Vercel a partir del repo de GitHub `n68y4ffyzs-lang/Stats-partidos`, rama `main` — cada push a `main` se despliega automáticamente en `https://stats-partidos.vercel.app/`.

## Flujo de commits

Después de cada cambio que hagas en el código de este proyecto, ejecuta automáticamente y sin preguntar antes:

1. `git add` de los archivos modificados
2. `git commit` con un mensaje descriptivo del cambio
3. `git push`

No pidas confirmación para estos tres pasos en este repositorio — el usuario ya los ha autorizado de forma permanente. Sí sigue pidiendo confirmación para cualquier otra operación de git potencialmente destructiva (reset --hard, force push, borrar ramas, etc.).

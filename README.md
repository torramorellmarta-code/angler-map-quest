# Fish Finder Maps

Quiero montar una app de pesca, que tenga google maps para mapear los sitios donde puedes ir  a pescar, que se necesita en cada sitio que se puede ir a pescar, los pescados que hay en la zona, tiempo y depresion y poder guardar los lugares que ya has ido

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://angler-map-quest.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4886b4a7-c7ab-4a77-82ad-68f450b3d0a0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploy from GitHub

La aplicación necesita un runtime de servidor para las funciones de Supabase,
autenticación y tiempo. Por eso el workflow de GitHub publica el Worker en
Cloudflare en cada push a `main`; GitHub Pages no puede ejecutar estas funciones.

En `Settings > Secrets and variables > Actions` del repositorio, añade estos
secrets:

- `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`
- `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` y `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID`
- `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY` y `GOOGLE_MAPS_API_KEY`

El token de Cloudflare debe poder desplegar Workers. Tras guardar los secrets,
un push a `main` iniciará el despliegue desde la pestaña `Actions`.

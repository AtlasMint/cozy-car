// Dev server.
//
// Bun 1.4.x bundles an imported .html file into a hot-reloading route (Bun's HTML entrypoint
// bundler). `bun ./index.html` on its own would serve the app too, but it cannot serve files
// that are fetched at runtime from ./public (the audio loops), so the entrypoint is wrapped in
// Bun.serve with a static fallback. Run with `bun --hot ./dev.ts` (the `dev` script).
import index from './index.html';

const port = Number(process.env.PORT ?? 3000);
const publicDir = new URL('./public/', import.meta.url);

Bun.serve({
  port,
  development: { hmr: true, console: true },
  routes: { '/': index },
  async fetch(req) {
    const pathname = new URL(req.url).pathname;
    if (pathname.includes('..')) return new Response('Bad path', { status: 400 });
    const file = Bun.file(new URL('.' + pathname, publicDir));
    if (await file.exists()) return new Response(file);
    return new Response('Not found', { status: 404 });
  },
});

console.log(`Shotgun dev server → http://localhost:${port}`);

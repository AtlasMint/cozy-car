// Dev server.
//
// Bun 1.4.x bundles an imported .html file into a hot-reloading route (Bun's HTML entrypoint
// bundler). `bun ./index.html` on its own would serve the app too, but it cannot serve files
// that are fetched at runtime from ./public (the audio loops), so the entrypoint is wrapped in
// Bun.serve with a static fallback. Run with `bun --hot ./dev.ts` (the `dev` script).
//
// It listens on this machine only. `bun run dev --host` listens on every interface instead, so
// a phone or another computer on the same network can open it, and prints the address to use.
import index from './index.html';
import { networkInterfaces } from 'node:os';

const port = Number(process.env.PORT ?? 5555);
const host = process.argv.includes('--host');
const publicDir = new URL('./public/', import.meta.url);

Bun.serve({
  port,
  hostname: host ? '0.0.0.0' : 'localhost',
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
if (host) {
  for (const a of Object.values(networkInterfaces()).flat()) {
    if (a?.family === 'IPv4' && !a.internal) console.log(`  on your network → http://${a.address}:${port}`);
  }
}

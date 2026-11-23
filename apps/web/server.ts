/**
 * Production server: `vp build`, then `bun server.ts`.
 * Serves the built client assets and hands everything else (pages and `/api/*`) to Start.
 */
import { join, normalize } from "node:path";

// Built output: not present until `vp build`, so it is loaded untyped.
const entry = "./dist/server/server.js";
const { default: handler } = (await import(entry)) as {
  default: { fetch(request: Request): Promise<Response> };
};

const port = Number(process.env.PORT ?? 3001);
const clientDir = join(import.meta.dir, "dist/client");

Bun.serve({
  port,
  maxRequestBodySize: 1024 * 1024,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && !pathname.startsWith("/api/") && pathname.includes(".")) {
      const path = normalize(join(clientDir, decodeURIComponent(pathname)));
      if (path.startsWith(clientDir)) {
        const file = Bun.file(path);
        if (await file.exists()) {
          const immutable = pathname.startsWith("/assets/");
          return new Response(file, {
            headers: immutable ? { "cache-control": "public, max-age=31536000, immutable" } : {},
          });
        }
      }
    }
    return handler.fetch(request);
  },
});

console.log(`DevDAJ web listening on http://localhost:${port}`);

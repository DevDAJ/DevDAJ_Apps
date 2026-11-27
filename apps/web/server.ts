/**
 * Production server: `vp build`, then `bun server.ts`.
 * Serves built client assets, the exported Pantry web app at `/pantry/app/`, and hands everything
 * else (pages and `/api/*`) to Start.
 */
import { join } from "node:path";

import { staticPath } from "./src/server/shared/static-path";

// Built output: not present until `vp build`, so it is loaded untyped.
const entry = "./dist/server/server.js";
const { default: handler } = (await import(entry)) as {
  default: { fetch(request: Request): Promise<Response> };
};

const port = Number(process.env.PORT ?? 3001);
const clientDir = join(import.meta.dir, "dist/client");
const pantryPrefix = "/pantry/app";

Bun.serve({
  port,
  maxRequestBodySize: 1024 * 1024,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (pathname === pantryPrefix || pathname.startsWith(`${pantryPrefix}/`))
    ) {
      if (pathname === pantryPrefix) {
        return new Response(null, {
          status: 308,
          headers: { location: `${pantryPrefix}/` },
        });
      }
      const rootDir = process.env.PANTRY_WEB_DIR ?? join(import.meta.dir, "../pantry/dist");
      const path = staticPath(rootDir, pathname.slice(pantryPrefix.length));
      const isFile = pathname.slice(pathname.lastIndexOf("/")).includes(".");
      if (path && isFile) {
        const file = Bun.file(path);
        if (await file.exists()) {
          const immutable = pathname.startsWith(`${pantryPrefix}/_expo/static/`);
          return new Response(file, {
            headers: {
              "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
            },
          });
        }
      }
      const index = Bun.file(join(rootDir, "index.html"));
      // Missing files 404 so the service worker never caches the HTML shell as a script.
      if (!isFile && (await index.exists())) {
        return new Response(index, { headers: { "cache-control": "no-cache" } });
      }
      return new Response("Pantry web app is not built.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (request.method === "GET" && !pathname.startsWith("/api/") && pathname.includes(".")) {
      const path = staticPath(clientDir, pathname);
      if (path) {
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

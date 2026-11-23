import { Elysia } from "elysia";
import { ApiError } from "./errors";
import { readLimitedBody } from "./http";

/**
 * Per-route body size limits, enforced while streaming (not just via Content-Length).
 * - `jsonLimit: bytes` parses the body as JSON (400 on bad JSON, 413 when too large).
 * - `textLimit: bytes` hands the raw body to the handler as a string (e.g. for webhook signatures).
 */
export const bodyLimits = new Elysia({ name: "shared.body" }).macro({
  jsonLimit: (maxBytes: number) => ({
    async parse({ request }) {
      const raw = await readLimitedBody(request, maxBytes);
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new ApiError(400, "Invalid JSON.");
      }
    },
  }),
  textLimit: (maxBytes: number) => ({
    parse: ({ request }) => readLimitedBody(request, maxBytes),
  }),
});

import { createFileRoute } from "@tanstack/react-router";
import { app } from "../../server/app";

/** Every `/api/*` request goes to the Elysia API (also used by the mobile apps). */
const handle = ({ request }: { request: Request }) => app.handle(request);

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      OPTIONS: handle,
      HEAD: handle,
    },
  },
});

import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { errorHandler } from "./shared/errors";
import { v1 } from "./v1";

const corsOrigins = process.env.API_CORS_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** The unified DevDAJ API: `/api/v<version>/<app>/...`. */
export const app = new Elysia({ prefix: "/api" })
  .use(errorHandler)
  .use(cors({ origin: corsOrigins?.length ? corsOrigins : false }))
  .use(
    openapi({
      path: "/docs",
      enabled: process.env.NODE_ENV !== "production",
      documentation: { info: { title: "DevDAJ API", version: "1" } },
    }),
  )
  .get("/health", () => ({ ok: true }))
  .use(v1);

export type App = typeof app;

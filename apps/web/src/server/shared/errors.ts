import { Elysia } from "elysia";
import { BodyTooLargeError } from "./http";

/** An error with an HTTP status and extra JSON fields, rendered as `{ error, ...extra }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Upstream errors (Supabase, fetch wrappers) sometimes carry a numeric `status`. */
export function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Global error shape for every app: `{ error: string, ...extra }`.
 * Registered once on the root app with `as: "global"`.
 */
export const errorHandler = new Elysia({ name: "shared.errors" })
  .error({ ApiError, BodyTooLargeError })
  .onError({ as: "global" }, ({ code, error, set }) => {
    switch (code) {
      case "ApiError":
        set.status = error.status;
        return { error: error.message, ...error.extra };
      case "BodyTooLargeError":
        set.status = 413;
        return { error: "Request is too large." };
      case "VALIDATION":
        set.status = 400;
        return { error: error.valueError?.message ?? "Invalid request." };
      case "PARSE": {
        // Errors thrown inside a parse hook (see shared/body.ts) arrive wrapped, original as `cause`.
        const cause = (error as { cause?: unknown }).cause;
        if (cause instanceof BodyTooLargeError) {
          set.status = 413;
          return { error: "Request is too large." };
        }
        if (cause instanceof ApiError) {
          set.status = cause.status;
          return { error: cause.message, ...cause.extra };
        }
        set.status = 400;
        return { error: "Invalid JSON." };
      }
      case "NOT_FOUND":
        set.status = 404;
        return { error: "Not found." };
      default:
        console.error("[api] unhandled", error);
        set.status = statusOf(error) ?? 500;
        return { error: messageOf(error, "Internal server error.") };
    }
  });

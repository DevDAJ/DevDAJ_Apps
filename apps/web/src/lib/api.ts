import { auth } from "./auth";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Browser → `/api/v1/...` with the signed-in user's bearer token. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await auth.getAccessToken();
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = data as { error?: string; code?: string } | null;
    throw new ApiRequestError(
      res.status,
      error?.error ?? `Request failed (${res.status}).`,
      error?.code,
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

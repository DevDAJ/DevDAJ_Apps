import { Elysia } from "elysia";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { ApiError, errorHandler } from "./errors";

function testApp() {
  return new Elysia()
    .use(errorHandler)
    .get("/api/v1/fitnexx/boom", () => {
      throw new Error("boom");
    })
    .get("/api/v1/fitnexx/client", () => {
      throw new ApiError(400, "bad input");
    })
    .get("/api/v1/fitnexx/server", () => {
      throw new ApiError(503, "upstream down");
    });
}

function stubFetch() {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => {
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FITNEXX_POSTHOG_API_KEY;
});

describe("errorHandler telemetry", () => {
  test("unhandled errors are captured with route context", async () => {
    process.env.FITNEXX_POSTHOG_API_KEY = "phc_test";
    const fetchMock = stubFetch();
    const response = await testApp().handle(new Request("http://localhost/api/v1/fitnexx/boom"));
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/batch/");
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as {
      api_key: string;
      batch: Array<{ event: string; properties: Record<string, unknown> }>;
    };
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(1);
    const event = body.batch[0];
    expect(event.event).toBe("$exception");
    expect(event.properties.route).toBe("/api/v1/fitnexx/boom");
    expect(event.properties.method).toBe("GET");
    expect(event.properties.status).toBe(500);
    expect(event.properties.$process_person_profile).toBe(false);
  });

  test("5xx ApiError is captured but expected 4xx is not", async () => {
    process.env.FITNEXX_POSTHOG_API_KEY = "phc_test";
    const fetchMock = stubFetch();
    const app = testApp();
    const server = await app.handle(new Request("http://localhost/api/v1/fitnexx/server"));
    expect(server.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const client = await app.handle(new Request("http://localhost/api/v1/fitnexx/client"));
    expect(client.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("without a project key nothing is sent", async () => {
    const fetchMock = stubFetch();
    const response = await testApp().handle(new Request("http://localhost/api/v1/fitnexx/boom"));
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

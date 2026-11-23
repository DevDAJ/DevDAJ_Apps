import { afterEach, expect, test, vi } from "vite-plus/test";

import { chatCompletion } from "./ai-chat";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

test("chatCompletion calls OpenRouter and maps content and usage", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 0,
        model: "openai/gpt-4.1-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Try squats." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const response = await chatCompletion({
    model: "openai/gpt-4.1-mini",
    messages: [{ role: "user", content: "Leg day?" }],
  });
  expect(response.content).toBe("Try squats.");
  expect(response.usage).toEqual({ promptTokens: 12, completionTokens: 4, totalTokens: 16 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as {
    model: string;
    provider?: { zdr?: boolean; data_collection?: string };
  };
  expect(body.model).toBe("openai/gpt-4.1-mini");
  expect(body.provider).toEqual({ zdr: true, data_collection: "deny" });
});

test("without an OpenRouter key nothing is sent", async () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    chatCompletion({ model: "openai/gpt-4.1-mini", messages: [{ role: "user", content: "Hi" }] }),
  ).rejects.toThrow("AI is not configured on the server.");
  expect(fetchMock).not.toHaveBeenCalled();
});

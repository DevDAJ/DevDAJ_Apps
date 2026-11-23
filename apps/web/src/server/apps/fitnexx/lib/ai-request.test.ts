import { expect, test } from "vite-plus/test";

import { aiCatalog } from "./ai-chat";
import { parseChatRequest } from "./ai-request";

const env = { FITNEXX_AI_MODELS: "openai/gpt-test,anthropic/claude-test" };

test("catalog parses the allowlist and falls back to a default", () => {
  expect(aiCatalog(env)).toEqual([
    { id: "openai/gpt-test", name: "openai/gpt-test" },
    { id: "anthropic/claude-test", name: "anthropic/claude-test" },
  ]);
  expect(aiCatalog({}).length).toBeGreaterThan(0);
});

test("accepts allowed models and caps output", () => {
  expect(
    parseChatRequest(
      {
        model: "openai/gpt-test",
        maxTokens: 99_999,
        messages: [{ role: "user", content: "Suggest a workout" }],
      },
      env,
    ),
  ).toMatchObject({ model: "openai/gpt-test", maxTokens: 2_000 });
});

test("rejects unapproved models and invalid messages", () => {
  expect(() =>
    parseChatRequest(
      { model: "openai/expensive", messages: [{ role: "user", content: "Hi" }] },
      env,
    ),
  ).toThrow();
  expect(() => parseChatRequest({ model: "openai/gpt-test", messages: [] }, env)).toThrow();
  expect(() =>
    parseChatRequest(
      { model: "openai/gpt-test", messages: [{ role: "user", content: "x".repeat(8_001) }] },
      env,
    ),
  ).toThrow();
});

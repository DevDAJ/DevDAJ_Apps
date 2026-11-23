import { afterEach, expect, test, vi } from "vite-plus/test";

import { createNutritionChain, createVisionChain, nutritionInput, visionMessages } from "./models";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answers with the payload as both content and a tool call, so either structured-output method parses. */
function stubCompletion(payload: unknown, toolName: string) {
  const json = JSON.stringify(payload);
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: json,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: toolName, arguments: json } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubCompletion>) {
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  return JSON.parse(typeof init?.body === "string" ? init.body : "") as {
    provider?: { zdr?: boolean; data_collection?: string };
  };
}

test("vision requests enforce OpenRouter zero data retention", async () => {
  const result = {
    items: [
      {
        name: "White rice",
        preparation: "steamed",
        portionDescription: "a small bowl",
        estimatedGrams: 150,
        confidence: "high",
      },
    ],
  };
  const fetchMock = stubCompletion(result, "food_scan_vision");
  const vision = createVisionChain("sk-or-test", "google/gemini-2.5-flash");
  await expect(vision.invoke(visionMessages("https://example.test/meal.jpg"))).resolves.toEqual(
    result,
  );
  expect(sentBody(fetchMock).provider).toEqual({ zdr: true, data_collection: "deny" });
});

test("nutrition requests enforce OpenRouter zero data retention", async () => {
  const result = {
    items: [
      {
        index: 0,
        per100: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
        fdcId: null,
        source: "ai",
        note: "Average cooked white rice.",
      },
    ],
  };
  const fetchMock = stubCompletion(result, "food_nutrition");
  const nutrition = createNutritionChain("sk-or-test", "openai/gpt-4.1-mini");
  const input = nutritionInput({
    components: [
      {
        index: 0,
        name: "White rice",
        preparation: "steamed",
        portionDescription: "a small bowl",
        estimatedGrams: 150,
      },
    ],
    references: ["No USDA reference available."],
  });
  await expect(nutrition.invoke(input)).resolves.toEqual(result);
  expect(sentBody(fetchMock).provider).toEqual({ zdr: true, data_collection: "deny" });
});

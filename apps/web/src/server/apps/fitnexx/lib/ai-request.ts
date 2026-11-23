import { aiCatalog, type ChatMessage, type ChatRequest } from "./ai-chat";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error("Messages must contain between 1 and 20 items.");
  }
  return value.map((message) => {
    if (
      !isObject(message) ||
      !["system", "user", "assistant"].includes(String(message.role)) ||
      typeof message.content !== "string" ||
      message.content.length === 0 ||
      message.content.length > 8_000
    ) {
      throw new Error("Each message needs a valid role and 1 to 8,000 characters.");
    }
    return {
      role: message.role as ChatMessage["role"],
      content: message.content,
    };
  });
}

/** Validates a Pro chat request against the OpenRouter model catalog. */
export function parseChatRequest(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ChatRequest {
  if (!isObject(value) || typeof value.model !== "string" || !value.model.trim()) {
    throw new Error("Select a model.");
  }
  const model = value.model.trim();
  if (!aiCatalog(env).some((entry) => entry.id === model)) {
    throw new Error("That model is not enabled for Fitnexx Pro.");
  }
  const maxTokens =
    typeof value.maxTokens === "number"
      ? Math.min(2_000, Math.max(1, Math.floor(value.maxTokens)))
      : 800;
  const temperature =
    typeof value.temperature === "number" ? Math.min(1, Math.max(0, value.temperature)) : 0.4;
  return { model, messages: parseMessages(value.messages), maxTokens, temperature };
}

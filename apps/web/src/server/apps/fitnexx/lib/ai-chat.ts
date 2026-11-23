import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { MessageContent } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { fitnexxEnv } from "../env";
import { OPENROUTER_BASE_URL, OPENROUTER_MODEL_KWARGS } from "./openrouter";

/**
 * Pro AI chat: one LangChain chain over OpenRouter, the same stack as the food
 * scanner. App-local on purpose; shared packages stay app-agnostic.
 */

const DEFAULT_AI_MODELS = "openai/gpt-4.1-mini,anthropic/claude-sonnet-4,google/gemini-2.5-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type ChatResponse = { content: string; usage: ChatUsage };
export type ChatModelInfo = { id: string; name: string };
export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

/** Pro model catalog: comma-separated OpenRouter model ids in FITNEXX_AI_MODELS. */
export function aiCatalog(env: NodeJS.ProcessEnv = process.env): ChatModelInfo[] {
  return (env.FITNEXX_AI_MODELS ?? DEFAULT_AI_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .map((id) => ({ id, name: id }));
}

function textOf(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join("");
}

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const apiKey = fitnexxEnv.openrouterApiKey;
  if (!apiKey) throw new Error("AI is not configured on the server.");
  const model = new ChatOpenAI({
    apiKey,
    model: request.model,
    temperature: request.temperature ?? 0.4,
    maxTokens: request.maxTokens ?? 800,
    maxRetries: 2,
    useResponsesApi: false,
    modelKwargs: OPENROUTER_MODEL_KWARGS,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
  const response = await model.invoke(
    request.messages.map((message) =>
      message.role === "system"
        ? new SystemMessage(message.content)
        : message.role === "assistant"
          ? new AIMessage(message.content)
          : new HumanMessage(message.content),
    ),
  );
  const usage = response.usage_metadata;
  return {
    content: textOf(response.content),
    usage: {
      promptTokens: usage?.input_tokens ?? 0,
      completionTokens: usage?.output_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}

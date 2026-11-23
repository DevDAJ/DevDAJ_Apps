import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { OPENROUTER_BASE_URL, OPENROUTER_MODEL_KWARGS } from "../openrouter";
import {
  NutritionResultSchema,
  VisionComponentSchema,
  VisionResultSchema,
  type NutritionResult,
  type VisionResult,
} from "./schemas";

export const VISION_SYSTEM_PROMPT = [
  "You identify food in a photo of a meal.",
  "List each distinct visible food or drink as a separate component.",
  "Describe only visible evidence. Never invent hidden ingredients or nutrients.",
  "estimatedGrams must be your best visual estimate in grams for the whole visible portion of that component.",
  "portionDescription explains the visible portion in a short phrase, for example 'a heaped handful'.",
  "preparation is the visible cooking method when known, otherwise null. Examples: steamed, fried, grilled, raw.",
  "confidence reflects how certain you are about the food identity, not the portion weight.",
].join(" ");

export const NUTRITION_SYSTEM_PROMPT = [
  "You are a careful food nutritionist.",
  "For every component you return average nutrition per 100 grams of the cooked or prepared food as served.",
  "Use the USDA reference when provided, but adapt it to the stated preparation and cooking method.",
  " calories must be consistent with protein (4 kcal/g), carbs (4 kcal/g), fat (9 kcal/g) and fiber (2 kcal/g).",
  "Values are averages for raw or cooked weight as described in the input. Never return negative values.",
  "Keep note under 200 characters and explain any adjustment you made to the USDA reference.",
].join(" ");

function createModel(apiKey: string, model: string, maxTokens: number, temperature: number) {
  return new ChatOpenAI({
    apiKey,
    model,
    temperature,
    maxTokens,
    maxRetries: 2,
    useResponsesApi: false,
    modelKwargs: OPENROUTER_MODEL_KWARGS,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}

export function createVisionChain(apiKey: string, model: string) {
  const structured = createModel(apiKey, model, 1200, 0.1).withStructuredOutput(
    VisionResultSchema,
    { name: "food_scan_vision", strict: false },
  );
  return {
    model,
    invoke: (input: BaseLanguageModelInput): Promise<VisionResult> => structured.invoke(input),
  };
}

export function visionMessages(imageUrl: string): BaseLanguageModelInput {
  return [
    new SystemMessage(VISION_SYSTEM_PROMPT),
    new HumanMessage({
      content: [
        {
          type: "text",
          text: "Identify the foods in this photo. Return one item per distinct component.",
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }),
  ];
}

export function createNutritionChain(apiKey: string, model: string) {
  const structured = createModel(apiKey, model, 1600, 0).withStructuredOutput(
    NutritionResultSchema,
    { name: "food_nutrition", strict: false },
  );
  const chain = ChatPromptTemplate.fromMessages([
    ["system", NUTRITION_SYSTEM_PROMPT],
    ["human", "{input}"],
  ]).pipe(structured);
  return {
    model,
    invoke: (input: string): Promise<NutritionResult> => chain.invoke({ input }),
  };
}

export function nutritionInput(input: {
  components: Array<{
    index: number;
    name: string;
    preparation: string | null;
    portionDescription: string;
    estimatedGrams: number;
  }>;
  references: string[];
  correction?: string;
}): string {
  const payload = {
    components: input.components.map((component) => ({
      index: component.index,
      name: component.name,
      preparation: component.preparation,
      portionDescription: component.portionDescription,
      estimatedGrams: component.estimatedGrams,
    })),
    usdaReferencesByIndex: input.references,
    instructions:
      "Return exactly one nutrition item per input index. Set fdcId to the USDA fdcId you used, or null when no reference fits. Set source to 'usda' when you used a USDA record, otherwise 'ai'.",
  };
  return JSON.stringify(payload) + (input.correction ? `\n\nCORRECTION: ${input.correction}` : "");
}

export { VisionComponentSchema };

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { OPENROUTER_BASE_URL, OPENROUTER_MODEL_KWARGS } from "../../../shared/openrouter";
import {
  MAX_INGREDIENTS,
  MAX_STEPS,
  MAX_STEP_LENGTH,
  type ParsedRecipe,
} from "./ingredient-parser";

const MAX_INPUT_LENGTH = 12_000;
const MAX_TITLE_LENGTH = 120;
const MAX_INGREDIENT_TEXT_LENGTH = 200;
const MAX_NAME_LENGTH = 80;

const RECIPE_UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "clove",
  "piece",
  "sprig",
  "stalk",
  "sheet",
  "pinch",
  "handful",
  "can",
] as const;

const SYSTEM_PROMPT = [
  "Extract a recipe from the video caption and comments provided by the user.",
  "Return only what the text states. Never invent ingredients, quantities or steps.",
  "quantity is a number when the text states one, otherwise null.",
  `unit is one of ${RECIPE_UNITS.join(", ")} when the text states one, otherwise null.`,
  "text is the ingredient phrase as written in the source.",
  "Write ingredient names and steps in Malay when the source is mainly Malay, otherwise in English.",
].join(" ");

const IngredientSchema = z.object({
  text: z.string().min(1).max(MAX_INGREDIENT_TEXT_LENGTH),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  quantity: z.number().nullable(),
  unit: z.enum(RECIPE_UNITS).nullable(),
});

const RecipeSchema = z.object({
  title: z.string().max(MAX_TITLE_LENGTH).nullable(),
  ingredients: z.array(IngredientSchema).max(MAX_INGREDIENTS),
  steps: z.array(z.string().max(MAX_STEP_LENGTH)).max(MAX_STEPS),
});

/** Last resort for captions the rule parser cannot read, never used for a quota-free path. */
export async function extractRecipeWithLlm(
  text: string,
  title: string | null,
  apiKey: string,
  model: string,
): Promise<ParsedRecipe> {
  const structured = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0,
    maxTokens: 1500,
    maxRetries: 2,
    useResponsesApi: false,
    modelKwargs: OPENROUTER_MODEL_KWARGS,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  }).withStructuredOutput(RecipeSchema, { name: "recipe_extraction", strict: false });

  const result = await structured.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(text.slice(0, MAX_INPUT_LENGTH)),
  ]);
  return {
    title: title?.trim() || result.title?.trim() || null,
    ingredients: result.ingredients.slice(0, MAX_INGREDIENTS).map((ingredient) => ({
      name: ingredient.name.toLowerCase(),
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      raw: ingredient.text,
    })),
    steps: result.steps.slice(0, MAX_STEPS).map((step) => step.slice(0, MAX_STEP_LENGTH)),
  };
}

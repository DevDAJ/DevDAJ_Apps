export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  raw: string;
}

export interface ParsedRecipe {
  title: string | null;
  ingredients: RecipeIngredient[];
  steps: string[];
}

export const MAX_INGREDIENTS = 100;
export const MAX_STEPS = 50;
export const MAX_STEP_LENGTH = 500;

const MAX_NAME_LENGTH = 80;
const MAX_HEADER_LENGTH = 60;
const MAX_TITLE_LENGTH = 120;

const INGREDIENT_HEADERS = new Set([
  "ingredients",
  "ingredient",
  "bahan",
  "bahan-bahan",
  "bahan bahan",
  "bahan utama",
  "bahan perap",
  "bahan kisar",
  "bahan tumis",
]);
const STEP_HEADERS = new Set([
  "method",
  "methods",
  "steps",
  "instructions",
  "directions",
  "how to make",
  "cara",
  "cara-cara",
  "cara cara",
  "cara masak",
  "cara memasak",
  "langkah",
]);
const STEP_KEYWORDS = [
  "step",
  "method",
  "instruction",
  "direction",
  "how to make",
  "cara",
  "langkah",
];
const INGREDIENT_KEYWORDS = [
  "ingredient",
  "bahan",
  "sauce",
  "kuah",
  "sos",
  "filling",
  "topping",
  "for the",
];

const UNIT_ALIASES: ReadonlyArray<{ alias: string; canonical: string }> = [
  { alias: "g", canonical: "g" },
  { alias: "gram", canonical: "g" },
  { alias: "grams", canonical: "g" },
  { alias: "gm", canonical: "g" },
  { alias: "kg", canonical: "kg" },
  { alias: "ml", canonical: "ml" },
  { alias: "l", canonical: "l" },
  { alias: "liter", canonical: "l" },
  { alias: "litre", canonical: "l" },
  { alias: "tsp", canonical: "tsp" },
  { alias: "teaspoon", canonical: "tsp" },
  { alias: "teaspoons", canonical: "tsp" },
  { alias: "sudu kecil", canonical: "tsp" },
  { alias: "sk", canonical: "tsp" },
  { alias: "s/k", canonical: "tsp" },
  { alias: "tbsp", canonical: "tbsp" },
  { alias: "tablespoon", canonical: "tbsp" },
  { alias: "tablespoons", canonical: "tbsp" },
  { alias: "sudu besar", canonical: "tbsp" },
  { alias: "sb", canonical: "tbsp" },
  { alias: "s/b", canonical: "tbsp" },
  { alias: "cup", canonical: "cup" },
  { alias: "cups", canonical: "cup" },
  { alias: "cawan", canonical: "cup" },
  { alias: "clove", canonical: "clove" },
  { alias: "cloves", canonical: "clove" },
  { alias: "ulas", canonical: "clove" },
  { alias: "pc", canonical: "piece" },
  { alias: "pcs", canonical: "piece" },
  { alias: "piece", canonical: "piece" },
  { alias: "pieces", canonical: "piece" },
  { alias: "biji", canonical: "piece" },
  { alias: "ketul", canonical: "piece" },
  { alias: "sprig", canonical: "sprig" },
  { alias: "sprigs", canonical: "sprig" },
  { alias: "tangkai", canonical: "sprig" },
  { alias: "stalk", canonical: "stalk" },
  { alias: "stalks", canonical: "stalk" },
  { alias: "batang", canonical: "stalk" },
  { alias: "helai", canonical: "sheet" },
  { alias: "keping", canonical: "sheet" },
  { alias: "slice", canonical: "sheet" },
  { alias: "slices", canonical: "sheet" },
  { alias: "pinch", canonical: "pinch" },
  { alias: "secubit", canonical: "pinch" },
  { alias: "sedikit", canonical: "pinch" },
  { alias: "handful", canonical: "handful" },
  { alias: "segenggam", canonical: "handful" },
  { alias: "genggam", canonical: "handful" },
  { alias: "can", canonical: "can" },
  { alias: "tin", canonical: "can" },
  { alias: "ekor", canonical: "whole" },
  { alias: "whole", canonical: "whole" },
  { alias: "inci", canonical: "inch" },
  { alias: "inch", canonical: "inch" },
  { alias: "inches", canonical: "inch" },
];

const AMOUNT_PHRASES = [
  "to taste",
  "as needed",
  "as required",
  "optional",
  "secukup rasa",
  "secukupnya",
  "sikit",
  "ikut suka",
];

const UNIT_ALTERNATION = [...UNIT_ALIASES]
  .sort((a, b) => b.alias.length - a.alias.length)
  .map(({ alias }) => alias)
  .join("|");
const UNIT_PATTERN = new RegExp(`^(?:${UNIT_ALTERNATION})(?![A-Za-z])`, "i");
const NUMBER = "\\d+(?:[.,]\\d+)?";
const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
};
const NUMBER_TOKEN = `(?:${NUMBER}|\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|[½⅓⅔¼¾⅛])`;
const TRAILING_QUANTITY = new RegExp(
  `[\\s,]+(${NUMBER_TOKEN})(?:\\s+((?:${UNIT_ALTERNATION})(?![A-Za-z])))?\\s*$`,
  "i",
);
const MALAY_NUMBERS: ReadonlyArray<{ word: string; value: number }> = [
  { word: "setengah", value: 0.5 },
  { word: "separuh", value: 0.5 },
  { word: "satu", value: 1 },
  { word: "dua", value: 2 },
  { word: "tiga", value: 3 },
  { word: "empat", value: 4 },
  { word: "lima", value: 5 },
  { word: "se", value: 1 },
];

type Quantity = { value: number; rest: string };
type Unit = { canonical: string; rest: string };

function decimal(raw: string): number {
  return Number(raw.replace(",", "."));
}

function numberFromToken(raw: string): number {
  const unicode = UNICODE_FRACTIONS[raw.trim()];
  if (unicode !== undefined) return unicode;
  if (raw.includes("/")) {
    const parts = raw.trim().split(/\s+/);
    const fraction = parts[parts.length - 1].split("/");
    const value = Number(fraction[0]) / Number(fraction[1]);
    return parts.length > 1 ? Number(parts[0]) + value : value;
  }
  return decimal(raw);
}

function readQuantity(text: string): Quantity | null {
  let match = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(text);
  if (match) {
    const denominator = Number(match[3]);
    if (denominator > 0) {
      return {
        value: Number(match[1]) + Number(match[2]) / denominator,
        rest: text.slice(match[0].length),
      };
    }
  }
  match = /^(\d+)\s*\/\s*(\d+)/.exec(text);
  if (match) {
    const denominator = Number(match[2]);
    if (denominator > 0) {
      return { value: Number(match[1]) / denominator, rest: text.slice(match[0].length) };
    }
  }
  const unicode = UNICODE_FRACTIONS[text[0]];
  if (unicode !== undefined) {
    return { value: unicode, rest: text.slice(1) };
  }
  match = new RegExp(`^(${NUMBER})`).exec(text);
  if (match) return { value: decimal(match[1]), rest: text.slice(match[0].length) };
  for (const { word, value } of MALAY_NUMBERS) {
    if (new RegExp(`^${word}\\b`, "i").test(text)) {
      return { value, rest: text.slice(word.length) };
    }
  }
  return null;
}

function stripRange(text: string): string {
  return text.replace(/^\s*-\s*\d+(?:[.,]\d+)?/, "");
}

function readUnit(text: string): Unit | null {
  const trimmed = text.replace(/^\s+/, "");
  const match = UNIT_PATTERN.exec(trimmed);
  if (!match) return null;
  const canonical = UNIT_ALIASES.find(
    ({ alias }) => alias.toLowerCase() === match[0].toLowerCase(),
  )?.canonical;
  return canonical ? { canonical, rest: trimmed.slice(match[0].length) } : null;
}

function cleanName(text: string): string | null {
  let name = text
    .replace(/\([^)]*\)/gu, "")
    .split(",", 1)[0]
    .replace(/^\s*(?:of\s+)?/iu, "")
    .replace(/^[\s\p{P}\p{S}]+/u, "");
  for (const phrase of AMOUNT_PHRASES) {
    name = name.replace(new RegExp(`[\\s,;:-]*${phrase}\\s*$`, "iu"), "");
  }
  name = name.trim().toLowerCase();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

function nameOnlyIngredient(line: string): RecipeIngredient | null {
  const name = cleanName(line);
  return name ? { name, quantity: null, unit: null, raw: line } : null;
}

/** Extract one ingredient from a description line, or null when it has no usable name. */
export function parseIngredientLine(line: string): RecipeIngredient | null {
  const raw = line.trim();
  if (!raw) return null;

  const leading = readQuantity(raw);
  if (leading) {
    const rest = stripRange(leading.rest);
    const unit = readUnit(rest);
    const name = cleanName(unit?.rest ?? rest);
    return name ? { name, quantity: leading.value, unit: unit?.canonical ?? null, raw } : null;
  }

  const trailing = TRAILING_QUANTITY.exec(raw);
  if (trailing) {
    const name = cleanName(raw.slice(0, trailing.index));
    return name
      ? {
          name,
          quantity: numberFromToken(trailing[1]),
          unit: trailing[2] ? (readUnit(trailing[2])?.canonical ?? null) : null,
          raw,
        }
      : null;
  }

  const unit = readUnit(raw);
  if (unit) {
    const name = cleanName(unit.rest);
    return name ? { name, quantity: null, unit: unit.canonical, raw } : null;
  }
  return null;
}

function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*•▪✅\u{FE0F}]+|\d+[.)])\s*/u, "")
    .replace(/(?:https?:\/\/|www\.)\S+/giu, "")
    .trim();
}

function cleanTitle(line: string): string {
  return line
    .replace(/(?:https?:\/\/|www\.)\S+/giu, "")
    .replace(/#\S+/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\u{FE0F}/gu, "")
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}

function headerKind(line: string): "ingredients" | "steps" | null {
  const normalized = line
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:\s]+$/, "")
    .trim();
  if (INGREDIENT_HEADERS.has(normalized)) return "ingredients";
  if (STEP_HEADERS.has(normalized)) return "steps";
  if (
    !line.trimEnd().endsWith(":") ||
    normalized.length > MAX_HEADER_LENGTH ||
    /\d/.test(normalized)
  ) {
    return null;
  }
  if (STEP_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "steps";
  if (INGREDIENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "ingredients";
  return null;
}

/** Rule-based extraction from a video description or caption. No network and no LLM. */
export function parseRecipeText(text: string, title?: string | null): ParsedRecipe {
  let mode: "none" | "ingredients" | "steps" = "none";
  let fallbackTitle: string | null = null;
  const ingredients: RecipeIngredient[] = [];
  const steps: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line || /^(?:#\S+\s*)+$/.test(line)) continue;

    const header = headerKind(line);
    if (header) {
      mode = header;
      continue;
    }

    const parsed = parseIngredientLine(line);
    const ingredient = parsed ?? (mode === "ingredients" ? nameOnlyIngredient(line) : null);
    if (fallbackTitle === null && !ingredient) {
      const candidate = cleanTitle(line);
      if (candidate) fallbackTitle = candidate;
    }

    if (mode === "steps") {
      if (steps.length < MAX_STEPS) steps.push(line.slice(0, MAX_STEP_LENGTH));
      continue;
    }
    if (ingredients.length >= MAX_INGREDIENTS) continue;
    if (ingredient) ingredients.push(ingredient);
  }

  return { title: title?.trim() || fallbackTitle, ingredients, steps };
}

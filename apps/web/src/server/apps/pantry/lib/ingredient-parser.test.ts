import { expect, test } from "vite-plus/test";
import { parseIngredientLine, parseRecipeText } from "./ingredient-parser";

test("parses an English YouTube description with sections and noise", () => {
  const text = [
    "My creamy tomato pasta recipe",
    "Ingredients:",
    "- 2 tbsp olive oil",
    "• 3 cloves garlic",
    "1/2 cup cream",
    "✅ 1 tsp salt",
    "#recipe #pasta",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "Instructions:",
    "1. Heat the oil.",
    "2. Add garlic and cream.",
  ].join("\n");
  expect(parseRecipeText(text, "  Easy pasta  ")).toEqual({
    title: "Easy pasta",
    ingredients: [
      { name: "olive oil", quantity: 2, unit: "tbsp", raw: "2 tbsp olive oil" },
      { name: "garlic", quantity: 3, unit: "clove", raw: "3 cloves garlic" },
      { name: "cream", quantity: 0.5, unit: "cup", raw: "1/2 cup cream" },
      { name: "salt", quantity: 1, unit: "tsp", raw: "1 tsp salt" },
    ],
    steps: ["Heat the oil.", "Add garlic and cream."],
  });
});

test("parses a Malay caption with bahan and cara sections", () => {
  const text = [
    "Resipi kuih mudah",
    "Bahan-bahan:",
    "2 sudu besar kicap",
    "3 ulas bawang putih",
    "1 cawan santan",
    "secubit garam",
    "Cara-cara:",
    "Panaskan minyak.",
    "Masukkan bawang dan kicap.",
  ].join("\n");
  expect(parseRecipeText(text)).toEqual({
    title: "Resipi kuih mudah",
    ingredients: [
      { name: "kicap", quantity: 2, unit: "tbsp", raw: "2 sudu besar kicap" },
      { name: "bawang putih", quantity: 3, unit: "clove", raw: "3 ulas bawang putih" },
      { name: "santan", quantity: 1, unit: "cup", raw: "1 cawan santan" },
      { name: "garam", quantity: null, unit: "pinch", raw: "secubit garam" },
    ],
    steps: ["Panaskan minyak.", "Masukkan bawang dan kicap."],
  });
});

test("keeps only quantified lines in a headerless caption", () => {
  const text = [
    "My quick breakfast #food #breakfast",
    "2 eggs",
    "1 cup milk",
    "salt to taste",
    "Garam & gula secukup rasa",
    "Mix it all together.",
    "www.example.com/cooking",
  ].join("\n");
  expect(parseRecipeText(text)).toEqual({
    title: "My quick breakfast",
    ingredients: [
      { name: "eggs", quantity: 2, unit: null, raw: "2 eggs" },
      { name: "milk", quantity: 1, unit: "cup", raw: "1 cup milk" },
    ],
    steps: [],
  });
});

test("keeps quantity-less ingredient lines and strips amount phrases", () => {
  const text = [
    "Ingredients:",
    "Garam & gula secukup rasa",
    "Salt and pepper to taste",
    "1 tsp sugar optional",
    "Bahan (optional) as needed",
    "Lada secukupnya",
    "Minyak sikit",
    "Cili ikut suka",
    "sayur as required",
  ].join("\n");
  expect(parseRecipeText(text)).toEqual({
    title: null,
    ingredients: [
      { name: "garam & gula", quantity: null, unit: null, raw: "Garam & gula secukup rasa" },
      { name: "salt and pepper", quantity: null, unit: null, raw: "Salt and pepper to taste" },
      { name: "sugar", quantity: 1, unit: "tsp", raw: "1 tsp sugar optional" },
      { name: "bahan", quantity: null, unit: null, raw: "Bahan (optional) as needed" },
      { name: "lada", quantity: null, unit: null, raw: "Lada secukupnya" },
      { name: "minyak", quantity: null, unit: null, raw: "Minyak sikit" },
      { name: "cili", quantity: null, unit: null, raw: "Cili ikut suka" },
      { name: "sayur", quantity: null, unit: null, raw: "sayur as required" },
    ],
    steps: [],
  });
});

test("falls back to the first descriptive line as title", () => {
  const text = [
    "#Resipi ✅ https://example.com/video",
    "Nasi goreng ayam #food #makan",
    "Bahan-bahan:",
    "2 biji telur",
  ].join("\n");
  expect(parseRecipeText(text).title).toBe("Nasi goreng ayam");
  expect(parseRecipeText(`${"x".repeat(150)} #tag`).title?.length).toBe(120);
});

test.each([
  ["1 g flour", "g", "flour"],
  ["1 gram flour", "g", "flour"],
  ["1 grams flour", "g", "flour"],
  ["1 gm flour", "g", "flour"],
  ["1 kg flour", "kg", "flour"],
  ["1 ml water", "ml", "water"],
  ["1 l water", "l", "water"],
  ["1 liter water", "l", "water"],
  ["1 litre water", "l", "water"],
  ["1 tsp salt", "tsp", "salt"],
  ["1 teaspoon salt", "tsp", "salt"],
  ["1 teaspoons salt", "tsp", "salt"],
  ["1 sudu kecil garam", "tsp", "garam"],
  ["1 sk garam", "tsp", "garam"],
  ["1 s/k garam", "tsp", "garam"],
  ["1 tbsp oil", "tbsp", "oil"],
  ["1 tablespoon oil", "tbsp", "oil"],
  ["1 tablespoons oil", "tbsp", "oil"],
  ["1 sudu besar minyak", "tbsp", "minyak"],
  ["1 sb minyak", "tbsp", "minyak"],
  ["1 s/b minyak", "tbsp", "minyak"],
  ["1 cup sugar", "cup", "sugar"],
  ["1 cups sugar", "cup", "sugar"],
  ["1 cawan gula", "cup", "gula"],
  ["1 clove garlic", "clove", "garlic"],
  ["1 cloves garlic", "clove", "garlic"],
  ["1 ulas bawang", "clove", "bawang"],
  ["1 pc chicken", "piece", "chicken"],
  ["1 pcs chicken", "piece", "chicken"],
  ["1 piece chicken", "piece", "chicken"],
  ["1 pieces chicken", "piece", "chicken"],
  ["1 biji telur", "piece", "telur"],
  ["1 ketul ayam", "piece", "ayam"],
  ["1 sprig parsley", "sprig", "parsley"],
  ["1 sprigs parsley", "sprig", "parsley"],
  ["1 tangkai daun", "sprig", "daun"],
  ["1 stalk celery", "stalk", "celery"],
  ["1 stalks celery", "stalk", "celery"],
  ["1 batang saderi", "stalk", "saderi"],
  ["1 helai daun", "sheet", "daun"],
  ["1 keping roti", "sheet", "roti"],
  ["1 slice bread", "sheet", "bread"],
  ["1 slices bread", "sheet", "bread"],
  ["1 pinch salt", "pinch", "salt"],
  ["1 secubit garam", "pinch", "garam"],
  ["1 sedikit garam", "pinch", "garam"],
  ["1 handful spinach", "handful", "spinach"],
  ["1 segenggam bayam", "handful", "bayam"],
  ["1 genggam bayam", "handful", "bayam"],
  ["1 can tomatoes", "can", "tomatoes"],
  ["1 tin tomato", "can", "tomato"],
  ["1 ekor ayam", "whole", "ayam"],
  ["1 whole chicken", "whole", "chicken"],
  ["1 inci halia", "inch", "halia"],
  ["1 inch ginger", "inch", "ginger"],
  ["1 inches ginger", "inch", "ginger"],
])("normalizes the %s alias", (line, unit, name) => {
  expect(parseIngredientLine(line)).toEqual({
    name,
    quantity: 1,
    unit,
    raw: line,
  });
});

test("parses fractions, ranges, decimals and Malay number words", () => {
  expect(parseIngredientLine("1/2 tsp salt")).toEqual({
    name: "salt",
    quantity: 0.5,
    unit: "tsp",
    raw: "1/2 tsp salt",
  });
  expect(parseIngredientLine("1 1/2 cups flour")).toEqual({
    name: "flour",
    quantity: 1.5,
    unit: "cup",
    raw: "1 1/2 cups flour",
  });
  expect(parseIngredientLine("½ cawan gula")).toEqual({
    name: "gula",
    quantity: 0.5,
    unit: "cup",
    raw: "½ cawan gula",
  });
  expect(parseIngredientLine("¾ teaspoon salt")?.quantity).toBe(0.75);
  expect(parseIngredientLine("2-3 cloves garlic")).toEqual({
    name: "garlic",
    quantity: 2,
    unit: "clove",
    raw: "2-3 cloves garlic",
  });
  expect(parseIngredientLine("1,5 kg ayam")?.quantity).toBe(1.5);
  expect(parseIngredientLine("Salt 1 tsp")).toEqual({
    name: "salt",
    quantity: 1,
    unit: "tsp",
    raw: "Salt 1 tsp",
  });
  expect(parseIngredientLine("kicap 2 sudu besar")).toEqual({
    name: "kicap",
    quantity: 2,
    unit: "tbsp",
    raw: "kicap 2 sudu besar",
  });
  expect(parseIngredientLine("satu cawan santan")?.quantity).toBe(1);
  expect(parseIngredientLine("se cawan santan")?.quantity).toBe(1);
  expect(parseIngredientLine("dua biji telur")?.quantity).toBe(2);
  expect(parseIngredientLine("tiga ulas bawang")?.quantity).toBe(3);
  expect(parseIngredientLine("empat keping roti")?.quantity).toBe(4);
  expect(parseIngredientLine("lima tangkai daun")?.quantity).toBe(5);
  expect(parseIngredientLine("setengah cawan gula")?.quantity).toBe(0.5);
  expect(parseIngredientLine("separuh cawan gula")?.quantity).toBe(0.5);
});

test("drops parenthetical notes anywhere and text after the first comma", () => {
  expect(parseIngredientLine("2 onions (chopped)")).toEqual({
    name: "onions",
    quantity: 2,
    unit: null,
    raw: "2 onions (chopped)",
  });
  expect(parseIngredientLine("4 cloves garlic, minced")).toEqual({
    name: "garlic",
    quantity: 4,
    unit: "clove",
    raw: "4 cloves garlic, minced",
  });
  expect(parseIngredientLine("1 ekor ayam (potong 12)")).toEqual({
    name: "ayam",
    quantity: 1,
    unit: "whole",
    raw: "1 ekor ayam (potong 12)",
  });
  expect(parseIngredientLine("2 onions, chopped (large)")).toEqual({
    name: "onions",
    quantity: 2,
    unit: null,
    raw: "2 onions, chopped (large)",
  });
});

test("rejects lines without a usable name", () => {
  expect(parseIngredientLine("")).toBeNull();
  expect(parseIngredientLine("salt to taste")).toBeNull();
  expect(parseIngredientLine("1 ")).toBeNull();
  expect(parseIngredientLine(`1 ${"x".repeat(81)}`)).toBeNull();
});

test("accepts other ingredient and method headers and caps long lists", () => {
  const ingredients = Array.from({ length: 120 }, (_, index) => `${index + 1} g sugar`);
  const steps = Array.from({ length: 60 }, (_, index) => `Step ${index + 1}: ${"x".repeat(600)}`);
  const result = parseRecipeText(
    ["For the sauce:", ...ingredients, "Cara Memasak:", ...steps].join("\n"),
  );
  expect(result.ingredients).toHaveLength(100);
  expect(result.steps).toHaveLength(50);
  expect(result.steps[0]).toHaveLength(500);
});

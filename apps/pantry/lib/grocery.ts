import type { GroceryItem, PantryItem, Recipe } from "./types";

export function normalizeName(name: string): string {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  const last = words[words.length - 1] ?? "";
  if (last.length > 3 && last.endsWith("s") && !last.endsWith("ss")) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(" ");
}

function words(name: string): string[] {
  return name.split(" ").filter(Boolean);
}

function covered(name: string, pantryNames: string[]): boolean {
  const nameWords = words(name);
  return pantryNames.some((pantry) => {
    if (name === pantry) {
      return true;
    }
    const pantryWords = words(pantry);
    return (
      pantryWords.every((word) => nameWords.includes(word)) ||
      nameWords.every((word) => pantryWords.includes(word))
    );
  });
}

export function buildGroceryItems(
  recipes: Recipe[],
  pantry: PantryItem[],
): Omit<GroceryItem, "listId" | "checked">[] {
  const pantryNames = pantry.map((item) => normalizeName(item.name));
  const merged = new Map<string, Omit<GroceryItem, "listId" | "checked">>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const name = normalizeName(ingredient.name);
      if (!name || covered(name, pantryNames)) {
        continue;
      }
      const unit = ingredient.unit;
      const key = `${name}\u0000${unit ?? ""}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          name: ingredient.name.trim(),
          quantity: ingredient.quantity,
          unit,
        });
        continue;
      }
      if (ingredient.quantity === null) {
        continue;
      }
      existing.quantity = (existing.quantity ?? 0) + ingredient.quantity;
    }
  }

  return [...merged.values()].sort((a, b) =>
    normalizeName(a.name).localeCompare(normalizeName(b.name)),
  );
}

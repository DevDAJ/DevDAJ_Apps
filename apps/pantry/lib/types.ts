export type PantryCategory = "pantry" | "spices" | "cold" | "meat";

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface Recipe {
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  sourceUrl: string | null;
  extractionId: string | null;
}

export interface PantryItem {
  name: string;
  category: PantryCategory;
}

export interface GroceryList {
  title: string;
  recipeIds: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface GroceryItem {
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
}

export type Entity = "recipe" | "pantry_item" | "grocery_list" | "grocery_item";

export interface EntityData {
  recipe: Recipe;
  pantry_item: PantryItem;
  grocery_list: GroceryList;
  grocery_item: GroceryItem;
}

export interface SyncRow {
  entity: Entity;
  rowId: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updatedAt: string;
}

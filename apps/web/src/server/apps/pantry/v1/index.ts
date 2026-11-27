import { Elysia } from "elysia";
import { households } from "./households";
import { imports } from "./imports";
import { recipes } from "./recipes";

/** Pantry Helper v1, mounted at `/api/v1/pantry`. */
export const pantryV1 = new Elysia({ name: "pantry.v1", prefix: "/pantry" })
  .use(households)
  .use(imports)
  .use(recipes);

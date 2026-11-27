import { Elysia } from "elysia";
import { sessionAuth } from "../../../shared/auth";
import { bodyLimits } from "../../../shared/body";
import { parseText } from "./imports.service";

const auth = "Sign in to use Pantry Helper.";

/** Rules-only parsing of a pasted recipe caption, with no quota or cache. */
export const recipes = new Elysia({ prefix: "/recipes", tags: ["pantry"] })
  .use(sessionAuth)
  .use(bodyLimits)
  .onTransform(({ set }) => {
    set.headers["cache-control"] = "no-store";
  })
  .post("/parse", ({ body }) => parseText(body), { auth, jsonLimit: 50_000 });

import { Elysia } from "elysia";
import { sessionAuth } from "../../../shared/auth";
import { bodyLimits } from "../../../shared/body";
import { getImportUsage, importRecipe } from "./imports.service";

const auth = "Sign in to use Pantry Helper.";

/** Recipe extraction from YouTube and TikTok links, limited per household per week. */
export const imports = new Elysia({
  prefix: "/households/:id/imports",
  tags: ["pantry"],
})
  .use(sessionAuth)
  .use(bodyLimits)
  .onTransform(({ set }) => {
    set.headers["cache-control"] = "no-store";
  })
  .get("", ({ params, user }) => getImportUsage(params.id, user.id), { auth })
  .post("", ({ params, user, body }) => importRecipe(params.id, user, body), {
    auth,
    jsonLimit: 2_000,
  });

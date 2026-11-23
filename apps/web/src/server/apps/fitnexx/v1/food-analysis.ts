import { Elysia } from "elysia";
import { bodyLimits } from "../../../shared/body";
import { rejectGuest } from "../../../shared/auth";
import { fitnexxAuth } from "../auth";
import {
  analyzeNutrition,
  analyzeScan,
  deleteScan,
  getUsage,
  isVisionRequest,
  prepareUpload,
  reviewScan,
  type Usage,
} from "./food-analysis.service";

/**
 * Food photo analysis. Same contract as the original Next.js route:
 * GET usage · PUT reserve upload · POST vision (`{scanId}`) or nutrition (`{requestId, detectedItems}`)
 * · PATCH review · DELETE scan.
 *
 * Guests get no food-analysis allowance: usage reads as 0 and the spending/review routes
 * return 403 `account_required` so the app can offer to create an account.
 */
const GUEST_USAGE: Usage = { isPro: false, limit: 0, remaining: 0 };

export const foodAnalysis = new Elysia({ prefix: "/food-analysis", tags: ["fitnexx"] })
  .use(fitnexxAuth)
  .use(bodyLimits)
  .onTransform(({ set }) => {
    set.headers["cache-control"] = "no-store";
  })
  .get("", ({ user }) => (user.isGuest ? GUEST_USAGE : getUsage(user.id)), {
    member: "Sign in to use food analysis.",
  })
  .put(
    "",
    ({ user, body }) => {
      rejectGuest(user);
      return prepareUpload(user.id, body);
    },
    {
      member: "Sign in to use food analysis.",
      jsonLimit: 2_000,
    },
  )
  .post(
    "",
    ({ user, body }) => {
      rejectGuest(user);
      return isVisionRequest(body) ? analyzeScan(user.id, body) : analyzeNutrition(user.id, body);
    },
    { member: "Sign in to use food analysis.", jsonLimit: 32_000 },
  )
  .patch(
    "",
    ({ user, body }) => {
      rejectGuest(user);
      return reviewScan(user.id, body);
    },
    {
      member: "Sign in to review food analysis.",
      jsonLimit: 32_000,
    },
  )
  .delete(
    "",
    async ({ user, body, set }) => {
      await deleteScan(user.id, body);
      set.status = 204;
    },
    { member: "Sign in to delete a food scan.", jsonLimit: 2_000 },
  );

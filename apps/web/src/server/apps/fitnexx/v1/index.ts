import { Elysia } from "elysia";
import { ai } from "./ai";
import { foodAnalysis } from "./food-analysis";
import { webhooks } from "./webhooks";

/** Fitnexx v1, mounted at `/api/v1/fitnexx`. */
export const fitnexxV1 = new Elysia({ name: "fitnexx.v1", prefix: "/fitnexx" })
  .use(ai)
  .use(foodAnalysis)
  .use(webhooks);

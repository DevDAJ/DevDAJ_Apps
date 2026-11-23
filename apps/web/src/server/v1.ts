import { Elysia } from "elysia";
import { fitnexxV1 } from "./apps/fitnexx/v1";
import { datasetV1 } from "./platform/dataset/routes";
import { adminV1 } from "./platform/routes";

/**
 * API v1: every app mounts its v1 routes here, giving `/api/v1/<app>/...`, next to the
 * platform-wide `/api/v1/dataset` (global dataset) and `/api/v1/admin` (dashboard).
 * A breaking change goes in a new `src/server/v2.ts` (reusing each module's lib), never in place.
 */
export const v1 = new Elysia({ name: "api.v1", prefix: "/v1" })
  .use(fitnexxV1)
  .use(datasetV1)
  .use(adminV1);

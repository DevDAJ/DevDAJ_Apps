import { Elysia } from "elysia";
import { bodyLimits } from "../../shared/body";
import { adminAuth } from "../admin";
import { getMetrics, syncMetrics } from "./service";

/** Store metrics, mounted at `/api/v1/admin/metrics`. */
export const metricsAdminV1 = new Elysia({ name: "metrics.admin.v1", prefix: "/metrics" })
  .use(adminAuth)
  .use(bodyLimits)
  .get("", ({ query }) => getMetrics(query), { admin: true })
  .post("/sync", ({ body }) => syncMetrics(body), { admin: true, jsonLimit: 1_000 });

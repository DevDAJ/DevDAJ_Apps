import { Elysia } from "elysia";
import { adminAuth } from "./admin";
import { datasetAdminV1 } from "./dataset/routes";
import { metricsAdminV1 } from "./metrics/routes";

/** Admin dashboard API, mounted at `/api/v1/admin`. Every route needs `admin: true`. */
export const adminV1 = new Elysia({ name: "admin.v1", prefix: "/admin" })
  .use(adminAuth)
  .get("/me", ({ user }) => ({ id: user.id, email: user.email }), { admin: true })
  .use(datasetAdminV1)
  .use(metricsAdminV1);

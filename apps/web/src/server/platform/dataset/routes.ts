import { Elysia } from "elysia";
import { sessionAuth } from "../../shared/auth";
import { bodyLimits } from "../../shared/body";
import { adminAuth } from "../admin";
import {
  approveContribution,
  listContributions,
  listGyms,
  listMyContributions,
  rejectContribution,
  submitContribution,
} from "./service";

/** Global dataset, mounted at `/api/v1/dataset`. Reads are public; writes go through review. */
export const datasetV1 = new Elysia({ name: "dataset.v1", prefix: "/dataset" })
  .use(sessionAuth)
  .use(bodyLimits)
  .get("/gyms", ({ query }) => listGyms(query))
  .post("/contributions", ({ user, body }) => submitContribution(user.id, body), {
    auth: "Sign in to contribute.",
    jsonLimit: 16_000,
  })
  .get("/contributions/mine", ({ user }) => listMyContributions(user.id), {
    auth: "Sign in to see your contributions.",
  });

/** Review queue, mounted at `/api/v1/admin/contributions`. */
export const datasetAdminV1 = new Elysia({ name: "dataset.admin.v1", prefix: "/contributions" })
  .use(adminAuth)
  .use(bodyLimits)
  .get("", ({ query }) => listContributions(query.status), { admin: true })
  .post("/:id/approve", ({ user, params, body }) => approveContribution(user.id, params.id, body), {
    admin: true,
    jsonLimit: 2_000,
  })
  .post("/:id/reject", ({ user, params, body }) => rejectContribution(user.id, params.id, body), {
    admin: true,
    jsonLimit: 2_000,
  });

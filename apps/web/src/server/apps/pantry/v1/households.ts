import { Elysia } from "elysia";
import { sessionAuth } from "../../../shared/auth";
import { bodyLimits } from "../../../shared/body";
import {
  createHousehold,
  createInvite,
  joinHousehold,
  leaveHousehold,
  listHouseholds,
  listMembers,
  syncHousehold,
} from "./households.service";

const auth = "Sign in to use Pantry Helper.";

/** Households, invites and row-level sync for Pantry Helper. Full accounts only. */
export const households = new Elysia({ prefix: "/households", tags: ["pantry"] })
  .use(sessionAuth)
  .use(bodyLimits)
  .onTransform(({ set }) => {
    set.headers["cache-control"] = "no-store";
  })
  .get("", ({ user }) => listHouseholds(user.id), { auth })
  .post("", ({ user, body }) => createHousehold(user, body), {
    auth,
    jsonLimit: 1_000,
  })
  .post("/join", ({ user, body }) => joinHousehold(user, body), {
    auth,
    jsonLimit: 1_000,
  })
  .get("/:id/members", ({ params, user }) => listMembers(params.id, user.id), { auth })
  .post("/:id/invites", ({ params, user }) => createInvite(params.id, user.id), { auth })
  .delete(
    "/:id/members/me",
    async ({ params, user, set }) => {
      await leaveHousehold(params.id, user.id);
      set.status = 204;
    },
    { auth },
  )
  .post("/:id/sync", ({ params, user, body }) => syncHousehold(params.id, user.id, body), {
    auth,
    jsonLimit: 512_000,
  });

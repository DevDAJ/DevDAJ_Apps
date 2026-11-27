import { Elysia } from "elysia";
import { households } from "./households";

/** Pantry Helper v1, mounted at `/api/v1/pantry`. */
export const pantryV1 = new Elysia({ name: "pantry.v1", prefix: "/pantry" }).use(households);

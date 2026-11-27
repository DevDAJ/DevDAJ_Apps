import { expect, test } from "vite-plus/test";
import { ApiError } from "../../../shared/errors";
import { newInviteCode, normalizeInviteCode } from "./invite";

const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

test("new invite codes use the unambiguous alphabet", () => {
  expect(newInviteCode()).toMatch(ALPHABET);
});

test("normalization uppercases and strips spaces and dashes", () => {
  expect(normalizeInviteCode(" abcd-2345 ")).toBe("ABCD2345");
});

test.each([
  ["non-string", 1234],
  ["too short", "ABCD234"],
  ["too long", "ABCD23456"],
  ["ambiguous letters", "ABCDI234"],
  ["ambiguous digits", "ABCD2014"],
  ["other characters", "ABCD@345"],
])("rejects %s codes", (_name, value) => {
  let error: unknown;
  try {
    normalizeInviteCode(value);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(400);
  expect((error as ApiError).message).toBe("Invalid invite code.");
});

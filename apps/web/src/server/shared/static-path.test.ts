import { expect, test } from "vite-plus/test";

import { staticPath } from "./static-path";

const root = "/srv/site";

test("resolves a normal file inside the root", () => {
  expect(staticPath(root, "/favicon.ico")).toBe(`${root}/favicon.ico`);
});

test("resolves a nested file inside the root", () => {
  expect(staticPath(root, "/assets/deep/app.js")).toBe(`${root}/assets/deep/app.js`);
});

test("rejects parent traversal", () => {
  expect(staticPath(root, "/../secret.txt")).toBeNull();
  expect(staticPath(root, "/assets/../../secret.txt")).toBeNull();
});

test("rejects encoded parent traversal", () => {
  expect(staticPath(root, "/%2e%2e/secret.txt")).toBeNull();
});

test("rejects bad percent encoding", () => {
  expect(staticPath(root, "/%E0%A4%A")).toBeNull();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { costClearFailed } from "./mutations.js";

test("a requested clear that comes back null succeeded", () => {
  assert.equal(costClearFailed(null, null), false);
});

test("a requested clear that still has an amount failed", () => {
  assert.equal(costClearFailed(null, "500.00"), true);
});

test("a normal (non-clearing) cost update is never flagged as a failed clear", () => {
  assert.equal(costClearFailed(500, "500.00"), false);
  assert.equal(costClearFailed(500, null), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { backoffDelayMs, isThrottledError, msUntilCapacityRestored } from "./client.js";

test("isThrottledError is false when there are no errors", () => {
  assert.equal(isThrottledError(undefined), false);
  assert.equal(isThrottledError([]), false);
});

test("isThrottledError is false for a non-throttle GraphQL error", () => {
  assert.equal(isThrottledError([{ message: "Access denied for products field." }]), false);
});

test("isThrottledError is true when any error carries the THROTTLED code", () => {
  assert.equal(
    isThrottledError([
      { message: "Some other error" },
      { message: "Throttled", extensions: { code: "THROTTLED" } },
    ]),
    true,
  );
});

test("msUntilCapacityRestored waits 0 with no known throttle status", () => {
  assert.equal(msUntilCapacityRestored(null), 0);
});

test("msUntilCapacityRestored waits 0 when capacity is already above the buffer", () => {
  const status = { maximumAvailable: 1000, currentlyAvailable: 500, restoreRate: 50 };
  assert.equal(msUntilCapacityRestored(status, 250), 0);
});

test("msUntilCapacityRestored computes wait time from the deficit and restoreRate", () => {
  const status = { maximumAvailable: 1000, currentlyAvailable: 50, restoreRate: 50 };
  // needs 250 - 50 = 200 more points, restoring at 50/sec -> 4 seconds
  assert.equal(msUntilCapacityRestored(status, 250), 4000);
});

test("msUntilCapacityRestored never divides by zero when restoreRate is 0", () => {
  const status = { maximumAvailable: 1000, currentlyAvailable: 0, restoreRate: 0 };
  assert.equal(msUntilCapacityRestored(status, 250), 0);
});

test("backoffDelayMs doubles each attempt", () => {
  assert.equal(backoffDelayMs(1, 1000), 1000);
  assert.equal(backoffDelayMs(2, 1000), 2000);
  assert.equal(backoffDelayMs(3, 1000), 4000);
  assert.equal(backoffDelayMs(5, 1000), 16000);
});

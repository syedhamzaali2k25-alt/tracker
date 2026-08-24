import assert from "node:assert/strict";
import { test } from "node:test";
import { gateState, hasPushAccess, trialDaysLeft, type StoredSubscription } from "./subscription.server";

const DAY_MS = 24 * 60 * 60 * 1000;

function subscription(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  return {
    shopifySubscriptionId: "gid://shopify/AppSubscription/1",
    status: "ACTIVE",
    isTest: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    ...overrides,
  };
}

// --- gateState: each Shopify status maps to the right gate state ---

test("gateState is none when the shop has no subscription row at all", () => {
  assert.equal(gateState(null), "none");
});

test("gateState is active for an ACTIVE subscription with no trial", () => {
  assert.equal(gateState(subscription({ status: "ACTIVE", trialEndsAt: null })), "active");
});

test("gateState is trialing for an ACTIVE subscription whose trial ends in the future", () => {
  const trialEndsAt = new Date(Date.now() + DAY_MS);
  assert.equal(gateState(subscription({ status: "ACTIVE", trialEndsAt })), "trialing");
});

test("gateState is active, not trialing, once the trial end date is in the past", () => {
  const trialEndsAt = new Date(Date.now() - DAY_MS);
  assert.equal(gateState(subscription({ status: "ACTIVE", trialEndsAt })), "active");
});

test("gateState treats a trial ending at this exact instant as already over", () => {
  // trialEndsAt is captured before gateState's own Date.now() read, so the
  // function always sees its own clock at or after this timestamp — this
  // pins down the ">" (not ">=") boundary in gateState's trial check.
  const trialEndsAt = new Date(Date.now());
  assert.equal(gateState(subscription({ status: "ACTIVE", trialEndsAt })), "active");
});

test("gateState is cancelled for a CANCELLED subscription", () => {
  assert.equal(gateState(subscription({ status: "CANCELLED" })), "cancelled");
});

test("gateState is declined for a DECLINED subscription", () => {
  assert.equal(gateState(subscription({ status: "DECLINED" })), "declined");
});

test("gateState is expired for an EXPIRED subscription", () => {
  assert.equal(gateState(subscription({ status: "EXPIRED" })), "expired");
});

test("gateState is frozen for a FROZEN subscription", () => {
  assert.equal(gateState(subscription({ status: "FROZEN" })), "frozen");
});

test("gateState is pending for a PENDING subscription", () => {
  assert.equal(gateState(subscription({ status: "PENDING" })), "pending");
});

// --- hasPushAccess: only trialing/active grant it ---

test("hasPushAccess is true while trialing", () => {
  const trialEndsAt = new Date(Date.now() + DAY_MS);
  assert.equal(hasPushAccess(subscription({ status: "ACTIVE", trialEndsAt })), true);
});

test("hasPushAccess is true once active past the trial", () => {
  assert.equal(hasPushAccess(subscription({ status: "ACTIVE", trialEndsAt: null })), true);
});

test("hasPushAccess is false with no subscription row at all", () => {
  assert.equal(hasPushAccess(null), false);
});

test("hasPushAccess is false for a cancelled subscription", () => {
  assert.equal(hasPushAccess(subscription({ status: "CANCELLED" })), false);
});

test("hasPushAccess is false for a declined subscription", () => {
  assert.equal(hasPushAccess(subscription({ status: "DECLINED" })), false);
});

test("hasPushAccess is false for an expired subscription", () => {
  assert.equal(hasPushAccess(subscription({ status: "EXPIRED" })), false);
});

test("hasPushAccess is false for a frozen subscription", () => {
  assert.equal(hasPushAccess(subscription({ status: "FROZEN" })), false);
});

test("hasPushAccess is false for a pending subscription", () => {
  assert.equal(hasPushAccess(subscription({ status: "PENDING" })), false);
});

// --- trialDaysLeft: boundary cases ---

test("trialDaysLeft is null when there's no trial end date", () => {
  assert.equal(trialDaysLeft(null), null);
});

test("trialDaysLeft rounds up to 1 for a trial ending later today", () => {
  const trialEndsAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours out
  assert.equal(trialDaysLeft(trialEndsAt), 1);
});

test("trialDaysLeft is 2 for a trial ending tomorrow, more than 24 hours out", () => {
  const trialEndsAt = new Date(Date.now() + 26 * 60 * 60 * 1000); // 26 hours out
  assert.equal(trialDaysLeft(trialEndsAt), 2);
});

test("trialDaysLeft is 0, not negative, once the trial end date has already passed", () => {
  const trialEndsAt = new Date(Date.now() - 10 * DAY_MS);
  assert.equal(trialDaysLeft(trialEndsAt), 0);
});

test("trialDaysLeft is 0 right at the boundary, when the trial ends at this exact instant", () => {
  // Same reasoning as the gateState "exact instant" case above: the
  // function's own Date.now() read can only land at or after this
  // timestamp, so the result is deterministically 0, never 1.
  const trialEndsAt = new Date(Date.now());
  assert.equal(trialDaysLeft(trialEndsAt), 0);
});

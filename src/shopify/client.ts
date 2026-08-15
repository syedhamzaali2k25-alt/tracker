import { config } from "../config.js";

export interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphQLError {
  message: string;
  extensions?: { code?: string };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: {
    cost?: {
      throttleStatus: ThrottleStatus;
    };
  };
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
// Shopify's default bucket is 1000 points; keep this much in reserve before
// firing the next request so a big query doesn't immediately get throttled.
const THROTTLE_SAFETY_BUFFER = 250;

/** Persists across calls so a low bucket from one query slows down the next. */
let lastThrottleStatus: ThrottleStatus | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isThrottledError(errors: GraphQLError[] | undefined): boolean {
  return (errors ?? []).some((e) => e.extensions?.code === "THROTTLED");
}

/**
 * How long to wait before the next call so currentlyAvailable has a chance
 * to restore up to bufferPoints, based on restoreRate (points/second).
 * Never negative; 0 when there's no status yet or capacity is already fine.
 */
export function msUntilCapacityRestored(
  status: ThrottleStatus | null,
  bufferPoints: number = THROTTLE_SAFETY_BUFFER,
): number {
  if (!status || status.restoreRate <= 0) return 0;
  const deficit = bufferPoints - status.currentlyAvailable;
  if (deficit <= 0) return 0;
  return Math.ceil((deficit / status.restoreRate) * 1000);
}

export function backoffDelayMs(attempt: number, baseMs: number = BASE_BACKOFF_MS): number {
  return baseMs * 2 ** (attempt - 1);
}

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const url = `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}/graphql.json`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const proactiveWait = msUntilCapacityRestored(lastThrottleStatus);
    if (proactiveWait > 0) await sleep(proactiveWait);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.shopify.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Shopify API error 429: still rate-limited after ${MAX_ATTEMPTS} attempts. Try again later.`,
        );
      }
      await sleep(backoffDelayMs(attempt));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }

    const body = (await response.json()) as GraphQLResponse<T>;

    if (body.extensions?.cost?.throttleStatus) {
      lastThrottleStatus = body.extensions.cost.throttleStatus;
    }

    if (isThrottledError(body.errors)) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Shopify GraphQL error: THROTTLED after ${MAX_ATTEMPTS} attempts. Try again later.`);
      }
      const throttleWait = msUntilCapacityRestored(lastThrottleStatus);
      await sleep(Math.max(backoffDelayMs(attempt), throttleWait));
      continue;
    }

    if (body.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
    }

    if (!body.data) {
      throw new Error("Shopify GraphQL response had no data");
    }

    return body.data;
  }

  throw new Error(`Shopify GraphQL request failed after ${MAX_ATTEMPTS} attempts.`);
}

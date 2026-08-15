import { shopifyGraphQL } from "./client.js";

const PRODUCT_VARIANTS_BULK_UPDATE = /* GraphQL */ `
  mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_ITEM_UPDATE = /* GraphQL */ `
  mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem {
        id
        unitCost {
          amount
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface UserError {
  field: string[] | null;
  message: string;
}

interface ProductVariantsBulkUpdateResponse {
  productVariantsBulkUpdate: {
    productVariants: Array<{ id: string; price: string }>;
    userErrors: UserError[];
  };
}

interface InventoryItemUpdateResponse {
  inventoryItemUpdate: {
    inventoryItem: { id: string; unitCost: { amount: string } | null } | null;
    userErrors: UserError[];
  };
}

export interface PriceUpdate {
  productId: string;
  variantId: string;
  price: number;
}

export interface CostUpdate {
  inventoryItemId: string;
  /** null requests clearing the cost back to "not recorded". */
  cost: number | null;
}

function assertNoErrors(operation: string, userErrors: UserError[]): void {
  if (userErrors.length > 0) {
    const details = userErrors.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; ");
    throw new Error(`${operation} failed: ${details}`);
  }
}

/**
 * Shopify's InventoryItemInput.cost is nullable, so sending an explicit
 * `null` is the correct way to ask for a clear. We don't just trust that it
 * worked, though — the mutation's own response tells us whether the clear
 * actually took effect.
 */
export function costClearFailed(requestedCost: number | null, resultingAmount: string | null): boolean {
  return requestedCost === null && resultingAmount !== null;
}

export async function applyPriceUpdates(updates: PriceUpdate[]): Promise<void> {
  const byProduct = new Map<string, PriceUpdate[]>();
  for (const update of updates) {
    const group = byProduct.get(update.productId) ?? [];
    group.push(update);
    byProduct.set(update.productId, group);
  }

  for (const [productId, group] of byProduct) {
    const data = await shopifyGraphQL<ProductVariantsBulkUpdateResponse>(
      PRODUCT_VARIANTS_BULK_UPDATE,
      {
        productId,
        variants: group.map((u) => ({ id: u.variantId, price: u.price.toFixed(2) })),
      },
    );
    assertNoErrors("productVariantsBulkUpdate", data.productVariantsBulkUpdate.userErrors);
  }
}

/** Returns the inventoryItemIds where a requested clear-to-null did not take effect. */
export async function applyCostUpdates(updates: CostUpdate[]): Promise<string[]> {
  const failedClears: string[] = [];

  for (const update of updates) {
    const data = await shopifyGraphQL<InventoryItemUpdateResponse>(INVENTORY_ITEM_UPDATE, {
      id: update.inventoryItemId,
      input: { cost: update.cost === null ? null : update.cost.toFixed(2) },
    });
    assertNoErrors("inventoryItemUpdate", data.inventoryItemUpdate.userErrors);

    const resultingAmount = data.inventoryItemUpdate.inventoryItem?.unitCost?.amount ?? null;
    if (costClearFailed(update.cost, resultingAmount)) {
      failedClears.push(update.inventoryItemId);
    }
  }

  return failedClears;
}

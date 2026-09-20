import { shopifyGraphQL, type ShopContext } from "./client.js";

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

const PRODUCT_UPDATE = /* GraphQL */ `
  mutation ProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
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

interface ProductUpdateResponse {
  productUpdate: {
    product: { id: string; title: string } | null;
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

export interface TitleUpdate {
  productId: string;
  title: string;
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

export async function applyPriceUpdates(
  shopContext: ShopContext,
  updates: PriceUpdate[],
): Promise<void> {
  const byProduct = new Map<string, PriceUpdate[]>();
  for (const update of updates) {
    const group = byProduct.get(update.productId) ?? [];
    group.push(update);
    byProduct.set(update.productId, group);
  }

  for (const [productId, group] of byProduct) {
    const data = await shopifyGraphQL<ProductVariantsBulkUpdateResponse>(
      shopContext,
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
export async function applyCostUpdates(
  shopContext: ShopContext,
  updates: CostUpdate[],
): Promise<string[]> {
  const failedClears: string[] = [];

  for (const update of updates) {
    const data = await shopifyGraphQL<InventoryItemUpdateResponse>(
      shopContext,
      INVENTORY_ITEM_UPDATE,
      {
        id: update.inventoryItemId,
        input: { cost: update.cost === null ? null : update.cost.toFixed(2) },
      },
    );
    assertNoErrors("inventoryItemUpdate", data.inventoryItemUpdate.userErrors);

    const resultingAmount = data.inventoryItemUpdate.inventoryItem?.unitCost?.amount ?? null;
    if (costClearFailed(update.cost, resultingAmount)) {
      failedClears.push(update.inventoryItemId);
    }
  }

  return failedClears;
}

/**
 * A title belongs to the product, not a variant, so callers (applyChanges,
 * undo) are expected to have already deduped `updates` to one entry per
 * productId — this makes no attempt to dedupe them itself, and would issue
 * a redundant productUpdate call for each duplicate.
 */
export async function applyTitleUpdates(
  shopContext: ShopContext,
  updates: TitleUpdate[],
): Promise<void> {
  for (const update of updates) {
    const data = await shopifyGraphQL<ProductUpdateResponse>(shopContext, PRODUCT_UPDATE, {
      product: { id: update.productId, title: update.title },
    });
    assertNoErrors("productUpdate", data.productUpdate.userErrors);
  }
}

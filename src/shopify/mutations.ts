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
  mutation InventoryItemUpdate($id: ID!, $input: InventoryItemUpdateInput!) {
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
  cost: number;
}

function assertNoErrors(operation: string, userErrors: UserError[]): void {
  if (userErrors.length > 0) {
    const details = userErrors.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; ");
    throw new Error(`${operation} failed: ${details}`);
  }
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

export async function applyCostUpdates(updates: CostUpdate[]): Promise<void> {
  for (const update of updates) {
    const data = await shopifyGraphQL<InventoryItemUpdateResponse>(INVENTORY_ITEM_UPDATE, {
      id: update.inventoryItemId,
      input: { cost: update.cost.toFixed(2) },
    });
    assertNoErrors("inventoryItemUpdate", data.inventoryItemUpdate.userErrors);
  }
}

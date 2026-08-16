import { shopifyGraphQL, type ShopContext } from "./client.js";
import type { VariantRow } from "../types.js";

const PRODUCTS_WITH_COST_QUERY = /* GraphQL */ `
  query ProductsWithCost($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        variants(first: 100) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            sku
            title
            price
            inventoryItem {
              id
              unitCost {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_VARIANTS_PAGE_QUERY = /* GraphQL */ `
  query ProductVariantsPage($productId: ID!, $cursor: String) {
    product(id: $productId) {
      variants(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          sku
          title
          price
          inventoryItem {
            id
            unitCost {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const RECENT_ORDERS_QUERY = /* GraphQL */ `
  query RecentOrders($cursor: String, $since: String!) {
    orders(first: 100, after: $cursor, query: $since) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        cancelledAt
        lineItems(first: 100) {
          nodes {
            quantity
            variant {
              id
            }
            discountedUnitPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
    }
  }
`;

interface ProductsResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      title: string;
      variants: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawVariant[];
      };
    }>;
  };
}

interface RawVariant {
  id: string;
  sku: string;
  title: string;
  price: string;
  inventoryItem: {
    id: string;
    unitCost: { amount: string; currencyCode: string } | null;
  };
}

interface ProductVariantsPageResponse {
  product: {
    variants: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: RawVariant[];
    };
  };
}

function toVariantRow(productId: string, productTitle: string, raw: RawVariant): VariantRow {
  return {
    productId,
    productTitle,
    variantId: raw.id,
    variantTitle: raw.title,
    sku: raw.sku ?? "",
    inventoryItemId: raw.inventoryItem.id,
    cost: raw.inventoryItem.unitCost ? Number(raw.inventoryItem.unitCost.amount) : null,
    price: Number(raw.price),
    currencyCode: raw.inventoryItem.unitCost?.currencyCode ?? "",
  };
}

export async function fetchAllVariants(shopContext: ShopContext): Promise<VariantRow[]> {
  const rows: VariantRow[] = [];
  let cursor: string | null = null;

  do {
    const data: ProductsResponse = await shopifyGraphQL<ProductsResponse>(
      shopContext,
      PRODUCTS_WITH_COST_QUERY,
      { cursor },
    );

    for (const product of data.products.nodes) {
      for (const variant of product.variants.nodes) {
        rows.push(toVariantRow(product.id, product.title, variant));
      }

      let variantPageInfo = product.variants.pageInfo;
      while (variantPageInfo.hasNextPage) {
        const page: ProductVariantsPageResponse =
          await shopifyGraphQL<ProductVariantsPageResponse>(
            shopContext,
            PRODUCT_VARIANTS_PAGE_QUERY,
            {
              productId: product.id,
              cursor: variantPageInfo.endCursor,
            },
          );

        for (const variant of page.product.variants.nodes) {
          rows.push(toVariantRow(product.id, product.title, variant));
        }
        variantPageInfo = page.product.variants.pageInfo;
      }
    }

    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  return rows;
}

interface OrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      cancelledAt: string | null;
      lineItems: {
        nodes: Array<{
          quantity: number;
          variant: { id: string } | null;
          discountedUnitPriceSet: { shopMoney: { amount: string } };
        }>;
      };
    }>;
  };
}

export interface VariantSales {
  unitsSold: number;
  revenue: number;
}

export async function fetchUnitsSoldByVariant(
  shopContext: ShopContext,
  lookbackDays: number,
): Promise<Map<string, VariantSales>> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceQuery = `created_at:>=${since.toISOString().slice(0, 10)}`;

  const sales = new Map<string, VariantSales>();
  let cursor: string | null = null;

  do {
    const data: OrdersResponse = await shopifyGraphQL<OrdersResponse>(
      shopContext,
      RECENT_ORDERS_QUERY,
      {
        cursor,
        since: sinceQuery,
      },
    );

    for (const order of data.orders.nodes) {
      if (order.cancelledAt) continue;

      for (const lineItem of order.lineItems.nodes) {
        if (!lineItem.variant) continue;

        const existing = sales.get(lineItem.variant.id) ?? { unitsSold: 0, revenue: 0 };
        existing.unitsSold += lineItem.quantity;
        existing.revenue +=
          Number(lineItem.discountedUnitPriceSet.shopMoney.amount) * lineItem.quantity;
        sales.set(lineItem.variant.id, existing);
      }
    }

    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor);

  return sales;
}

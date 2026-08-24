import {
  buildProductSearchQuery,
  type ExportFilters,
  EMPTY_EXPORT_FILTERS,
} from "./catalog-export-filters";

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

export type VariantEditorVariant = {
  id: string;
  label: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  barcode: string;
  inventoryItemId: string | null;
};

export type VariantEditorProduct = {
  id: string;
  handle: string;
  title: string;
  status: string;
  productType: string;
  tags: string[];
  variants: VariantEditorVariant[];
};

export type VariantEditorPage = {
  products: VariantEditorProduct[];
  totalCount: number;
  hasMore: boolean;
  endCursor: string | null;
};

export type VariantEditorChange = {
  productId: string;
  variantId: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  barcode: string;
};

export type VariantEditorSaveResult = {
  variantId: string;
  handle: string;
  success: boolean;
  errors: string[];
};

const VARIANT_EDITOR_PAGE_SIZE = 25;

const PRODUCTS_QUERY = `#graphql
  query VariantEditorProducts(
    $first: Int!
    $after: String
    $query: String
  ) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        handle
        title
        status
        productType
        tags
        variants(first: 100) {
          nodes {
            id
            sku
            price
            compareAtPrice
            barcode
            inventoryQuantity
            inventoryItem {
              id
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

const PRODUCTS_COUNT_QUERY = `#graphql
  query VariantEditorProductsCount($query: String) {
    productsCount(query: $query) {
      count
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE = `#graphql
  mutation VariantEditorBulkUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_SET_QUANTITIES = `#graphql
  mutation VariantEditorInventorySet($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const PRIMARY_LOCATION_QUERY = `#graphql
  query VariantEditorPrimaryLocation {
    locations(first: 1) {
      nodes {
        id
      }
    }
  }
`;

function formatVariantLabel(
  selectedOptions: Array<{ name: string; value: string }>,
): string {
  if (selectedOptions.length === 0) return "Variante única";
  const isDefault =
    selectedOptions.length === 1 &&
    selectedOptions[0]?.name === "Title" &&
    selectedOptions[0]?.value === "Default Title";
  if (isDefault) return "Variante única";
  return selectedOptions.map((o) => `${o.name}: ${o.value}`).join(" · ");
}

function buildSearchQuery(
  filters: ExportFilters,
  search: string,
): string | undefined {
  const parts: string[] = [];
  const base = buildProductSearchQuery(filters);
  if (base) parts.push(base);
  const term = search.trim();
  if (term) {
    parts.push(`title:*${term.replace(/"/g, '\\"')}*`);
  }
  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

function mapProduct(node: {
  id: string;
  handle: string;
  title: string;
  status: string;
  productType: string;
  tags: string[];
  variants: {
    nodes: Array<{
      id: string;
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      barcode: string | null;
      inventoryQuantity: number | null;
      inventoryItem: { id: string } | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
}): VariantEditorProduct {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    status: node.status,
    productType: node.productType ?? "",
    tags: node.tags ?? [],
    variants: node.variants.nodes.map((variant) => ({
      id: variant.id,
      label: formatVariantLabel(variant.selectedOptions ?? []),
      sku: variant.sku ?? "",
      price: variant.price ?? "",
      compareAtPrice: variant.compareAtPrice ?? "",
      stock:
        variant.inventoryQuantity != null
          ? String(variant.inventoryQuantity)
          : "",
      barcode: variant.barcode ?? "",
      inventoryItemId: variant.inventoryItem?.id ?? null,
    })),
  };
}

function collectUserErrors(
  errors: Array<{ message?: string } | null | undefined> | null | undefined,
): string[] {
  return (errors ?? [])
    .map((error) => error?.message?.trim() ?? "")
    .filter(Boolean);
}

export async function fetchVariantEditorPage(
  graphql: AdminGraphql,
  filters: ExportFilters = EMPTY_EXPORT_FILTERS,
  search = "",
  cursor: string | null = null,
  pageSize = VARIANT_EDITOR_PAGE_SIZE,
): Promise<VariantEditorPage> {
  const query = buildSearchQuery(filters, search);
  const [listResponse, countResponse] = await Promise.all([
    graphql(PRODUCTS_QUERY, {
      variables: { first: pageSize, after: cursor, query: query ?? null },
    }),
    cursor
      ? Promise.resolve(null)
      : graphql(PRODUCTS_COUNT_QUERY, {
          variables: { query: query ?? null },
        }),
  ]);

  const listJson = await listResponse.json();
  const products = listJson.data?.products;
  const nodes = products?.nodes ?? [];

  let totalCount = 0;
  if (countResponse) {
    const countJson = await countResponse.json();
    totalCount = countJson.data?.productsCount?.count ?? 0;
  }

  return {
    products: nodes.map(mapProduct),
    totalCount,
    hasMore: Boolean(products?.pageInfo?.hasNextPage),
    endCursor: products?.pageInfo?.endCursor ?? null,
  };
}

async function fetchPrimaryLocationId(
  graphql: AdminGraphql,
): Promise<string | null> {
  const response = await graphql(PRIMARY_LOCATION_QUERY);
  const json = await response.json();
  return json.data?.locations?.nodes?.[0]?.id ?? null;
}

function buildVariantBulkInput(change: VariantEditorChange): Record<string, unknown> {
  const variant: Record<string, unknown> = { id: change.variantId };
  if (change.price !== "") variant.price = change.price;
  if (change.compareAtPrice !== "") {
    variant.compareAtPrice = change.compareAtPrice;
  }
  if (change.barcode !== "") variant.barcode = change.barcode;
  if (change.sku !== "") {
    variant.inventoryItem = { sku: change.sku };
  }
  return variant;
}

export async function applyVariantEditorChanges(
  graphql: AdminGraphql,
  changes: VariantEditorChange[],
  originals: Map<
    string,
    Pick<
      VariantEditorVariant,
      "sku" | "price" | "compareAtPrice" | "stock" | "barcode" | "inventoryItemId"
    > & { handle: string }
  >,
): Promise<VariantEditorSaveResult[]> {
  const results: VariantEditorSaveResult[] = [];
  const needsLocation = changes.some((change) => {
    const original = originals.get(change.variantId);
    return original && change.stock !== original.stock;
  });
  const locationId = needsLocation
    ? await fetchPrimaryLocationId(graphql)
    : null;

  const byProduct = new Map<string, VariantEditorChange[]>();
  for (const change of changes) {
    const list = byProduct.get(change.productId) ?? [];
    list.push(change);
    byProduct.set(change.productId, list);
  }

  for (const [productId, productChanges] of byProduct) {
    const priceChanges = productChanges.filter((change) => {
      const original = originals.get(change.variantId);
      if (!original) return false;
      return (
        change.sku !== original.sku ||
        change.price !== original.price ||
        change.compareAtPrice !== original.compareAtPrice ||
        change.barcode !== original.barcode
      );
    });

    if (priceChanges.length > 0) {
      const response = await graphql(PRODUCT_VARIANTS_BULK_UPDATE, {
        variables: {
          productId,
          variants: priceChanges.map(buildVariantBulkInput),
        },
      });
      const json = await response.json();
      const userErrors = collectUserErrors(
        json.data?.productVariantsBulkUpdate?.userErrors,
      );

      for (const change of priceChanges) {
        const original = originals.get(change.variantId);
        results.push({
          variantId: change.variantId,
          handle: original?.handle ?? "",
          success: userErrors.length === 0,
          errors: userErrors,
        });
      }
    }

    for (const change of productChanges) {
      const original = originals.get(change.variantId);
      if (!original || change.stock === original.stock) continue;

      const prior = results.find((r) => r.variantId === change.variantId);
      if (prior && !prior.success) continue;

      if (!locationId) {
        results.push({
          variantId: change.variantId,
          handle: original.handle,
          success: false,
          errors: ["No se encontró ubicación de inventario."],
        });
        continue;
      }

      if (!original.inventoryItemId) {
        results.push({
          variantId: change.variantId,
          handle: original.handle,
          success: false,
          errors: ["La variante no tiene inventario configurable."],
        });
        continue;
      }

      const response = await graphql(INVENTORY_SET_QUANTITIES, {
        variables: {
          input: {
            name: "available",
            reason: "correction",
            quantities: [
              {
                inventoryItemId: original.inventoryItemId,
                locationId,
                quantity: Number.parseInt(change.stock, 10),
                changeFromQuantity: null,
              },
            ],
          },
        },
      });
      const json = await response.json();
      const userErrors = collectUserErrors(
        json.data?.inventorySetQuantities?.userErrors,
      );

      const existing = results.find((r) => r.variantId === change.variantId);
      if (existing) {
        existing.success = existing.success && userErrors.length === 0;
        existing.errors.push(...userErrors);
      } else {
        results.push({
          variantId: change.variantId,
          handle: original.handle,
          success: userErrors.length === 0,
          errors: userErrors,
        });
      }
    }
  }

  for (const change of changes) {
    if (!results.some((result) => result.variantId === change.variantId)) {
      const original = originals.get(change.variantId);
      results.push({
        variantId: change.variantId,
        handle: original?.handle ?? "",
        success: true,
        errors: [],
      });
    }
  }

  return results;
}

export { VARIANT_EDITOR_PAGE_SIZE };

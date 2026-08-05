import {
  buildMetafieldTypeMap,
  fetchCatalogProductMetafieldDefinitions,
  metafieldHeadersFromDefinitions,
} from "./catalog-metafields.server";
import {
  IMPORT_BATCH_SIZE,
  type CatalogRow,
  type ParsedCatalog,
  type RowValidationError,
} from "./catalog-schema";

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

export type ImportRowResult = {
  row: number;
  handle: string;
  success: boolean;
  productId?: string;
  errors: string[];
};

export type ImportBatchResult = {
  results: ImportRowResult[];
  validationErrors: RowValidationError[];
};

type ProductVariantNode = {
  id: string;
  sku: string | null;
  inventoryItem: { id: string } | null;
};

type ProductImportContext = {
  exists: boolean;
  productId?: string;
  variants: ProductVariantNode[];
};

const PRODUCT_SET = `#graphql
  mutation CatalogProductSet(
    $input: ProductSetInput!
    $identifier: ProductSetIdentifiers
    $synchronous: Boolean!
  ) {
    productSet(synchronous: $synchronous, input: $input, identifier: $identifier) {
      product {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE = `#graphql
  mutation CatalogVariantsBulkUpdate(
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
  mutation CatalogInventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const PRIMARY_LOCATION_QUERY = `#graphql
  query ImportPrimaryLocation {
    locations(first: 1) {
      nodes {
        id
      }
    }
  }
`;

const PRODUCT_IMPORT_CONTEXT_QUERY = `#graphql
  query ImportProductContext($handle: String!) {
    productByHandle(handle: $handle) {
      id
      variants(first: 100) {
        nodes {
          id
          sku
          inventoryItem {
            id
          }
        }
      }
    }
  }
`;

function normalizeStatus(status: string): "ACTIVE" | "DRAFT" | "ARCHIVED" {
  const upper = status.trim().toUpperCase();
  if (upper === "DRAFT" || upper === "ARCHIVED") return upper;
  return "ACTIVE";
}

function rowTouchesVariantPriceFields(row: CatalogRow): boolean {
  return (
    row.sku !== "" ||
    row.price !== "" ||
    row.compare_at_price !== "" ||
    row.barcode !== ""
  );
}

function rowTouchesStock(row: CatalogRow): boolean {
  return row.stock !== "";
}

function resolveVariant(
  variants: ProductVariantNode[],
  row: CatalogRow,
): ProductVariantNode | undefined {
  if (row.variant_id) {
    const byId = variants.find(
      (variant) =>
        variant.id === row.variant_id ||
        variant.id.endsWith(`/${row.variant_id}`),
    );
    if (byId) return byId;
  }

  if (row.sku) {
    const bySku = variants.find((variant) => variant.sku === row.sku);
    if (bySku) return bySku;
  }

  return variants[0];
}

function buildProductSetInput(
  row: CatalogRow,
  metafields: { namespace: string; key: string; value: string }[],
  isExistingProduct: boolean,
  metafieldTypes: Map<string, string> = new Map(),
  locationId?: string,
) {
  const tags = row.tags
    ? row.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const input: Record<string, unknown> = {
    handle: row.handle,
    title: row.title,
  };

  if (row.description_html) input.descriptionHtml = row.description_html;
  if (row.vendor) input.vendor = row.vendor;
  if (row.product_type) input.productType = row.product_type;
  if (row.status) input.status = normalizeStatus(row.status);
  if (tags.length > 0) input.tags = tags;

  if (metafields.length > 0) {
    input.metafields = metafields.map((mf) => ({
      namespace: mf.namespace,
      key: mf.key,
      type:
        metafieldTypes.get(`${mf.namespace}.${mf.key}`) ??
        "single_line_text_field",
      value: mf.value,
    }));
  }

  // Solo en altas: productSet con variante Default Title.
  // En existentes, precio/sku/stock van por productVariantsBulkUpdate / inventory.
  if (!isExistingProduct) {
    const variant: Record<string, unknown> = {
      optionValues: [{ optionName: "Title", name: "Default Title" }],
    };
    if (row.sku !== "") variant.sku = row.sku;
    if (row.price !== "") variant.price = row.price;
    if (row.compare_at_price !== "") {
      variant.compareAtPrice = row.compare_at_price;
    }
    if (row.barcode !== "") variant.barcode = row.barcode;
    if (row.stock !== "" && locationId) {
      variant.inventoryQuantities = [
        {
          locationId,
          name: "available",
          quantity: Number.parseInt(row.stock, 10),
        },
      ];
    }
    input.productOptions = [
      { name: "Title", values: [{ name: "Default Title" }] },
    ];
    input.variants = [variant];
  }

  return input;
}

function buildVariantBulkInput(
  row: CatalogRow,
  variantId: string,
): Record<string, unknown> {
  const variant: Record<string, unknown> = { id: variantId };
  if (row.price !== "") variant.price = row.price;
  if (row.compare_at_price !== "") {
    variant.compareAtPrice = row.compare_at_price;
  }
  if (row.barcode !== "") variant.barcode = row.barcode;
  if (row.sku !== "") {
    variant.inventoryItem = { sku: row.sku };
  }
  return variant;
}

function metafieldsForRow(
  parsed: ParsedCatalog,
  row: CatalogRow,
): { namespace: string; key: string; value: string }[] {
  return parsed.metafieldColumns
    .map((col) => {
      const value = ((row as Record<string, string>)[col.header] ?? "").trim();
      return value
        ? { namespace: col.namespace, key: col.key, value }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function collectUserErrors(
  errors: Array<{ message?: string } | null | undefined> | null | undefined,
): string[] {
  return (errors ?? [])
    .map((error) => error?.message?.trim() ?? "")
    .filter(Boolean);
}

async function fetchPrimaryLocationId(
  graphql: AdminGraphql,
): Promise<string | null> {
  const response = await graphql(PRIMARY_LOCATION_QUERY);
  const json = await response.json();
  return json.data?.locations?.nodes?.[0]?.id ?? null;
}

async function fetchProductImportContext(
  graphql: AdminGraphql,
  handle: string,
): Promise<ProductImportContext> {
  const response = await graphql(PRODUCT_IMPORT_CONTEXT_QUERY, {
    variables: { handle },
  });
  const json = await response.json();
  const product = json.data?.productByHandle;
  if (!product?.id) {
    return { exists: false, variants: [] };
  }

  return {
    exists: true,
    productId: product.id,
    variants: (product.variants?.nodes ?? []) as ProductVariantNode[],
  };
}

export async function importCatalogBatch(
  graphql: AdminGraphql,
  parsed: ParsedCatalog,
  startIndex: number,
  batchSize = IMPORT_BATCH_SIZE,
): Promise<ImportBatchResult> {
  const validationErrors = [...parsed.errors];
  const results: ImportRowResult[] = [];
  const end = Math.min(startIndex + batchSize, parsed.rows.length);
  const batchRows = parsed.rows.slice(startIndex, end);
  const hasMetafieldColumns = parsed.metafieldColumns.length > 0;
  const catalogMetafieldDefinitions = hasMetafieldColumns
    ? await fetchCatalogProductMetafieldDefinitions(graphql)
    : [];
  const allowedMetafieldHeaders = new Set(
    metafieldHeadersFromDefinitions(catalogMetafieldDefinitions),
  );
  const metafieldTypes = hasMetafieldColumns
    ? buildMetafieldTypeMap(catalogMetafieldDefinitions)
    : new Map<string, string>();

  const needsLocation = batchRows.some((row) => row.stock !== "");
  const locationId = needsLocation
    ? await fetchPrimaryLocationId(graphql)
    : null;

  for (let i = startIndex; i < end; i++) {
    const row = parsed.rows[i];
    const rowNum = i + 2;
    const rowErrors = validationErrors.filter((e) => e.row === rowNum);
    if (rowErrors.length > 0) {
      results.push({
        row: rowNum,
        handle: row.handle,
        success: false,
        errors: rowErrors.map((e) => e.message),
      });
      continue;
    }

    if (row.stock !== "" && !locationId) {
      results.push({
        row: rowNum,
        handle: row.handle,
        success: false,
        errors: [
          "No se encontró una ubicación de inventario para actualizar stock.",
        ],
      });
      continue;
    }

    const metafields = metafieldsForRow(parsed, row).filter((mf) =>
      allowedMetafieldHeaders.has(`metafield.${mf.namespace}.${mf.key}`),
    );

    try {
      const productContext = await fetchProductImportContext(
        graphql,
        row.handle,
      );
      const touchesVariant =
        rowTouchesVariantPriceFields(row) || rowTouchesStock(row);

      if (
        productContext.exists &&
        touchesVariant &&
        productContext.variants.length === 0
      ) {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: false,
          errors: [
            "El producto existe pero no tiene variantes para actualizar sku, precio o stock.",
          ],
        });
        continue;
      }

      const matchedVariant = productContext.exists
        ? resolveVariant(productContext.variants, row)
        : undefined;

      if (
        productContext.exists &&
        touchesVariant &&
        row.variant_id &&
        !matchedVariant
      ) {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: false,
          errors: [
            `No se encontró la variante ${row.variant_id} en el producto.`,
          ],
        });
        continue;
      }

      if (
        productContext.exists &&
        touchesVariant &&
        !matchedVariant
      ) {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: false,
          errors: [
            "No se pudo resolver la variante a actualizar (revisa variant_id o sku).",
          ],
        });
        continue;
      }

      const errors: string[] = [];
      let productId = productContext.productId;

      const productInput = buildProductSetInput(
        row,
        metafields,
        productContext.exists,
        metafieldTypes,
        locationId ?? undefined,
      );

      const productResponse = await graphql(PRODUCT_SET, {
        variables: {
          synchronous: true,
          identifier: { handle: row.handle },
          input: productInput,
        },
      });
      const productJson = await productResponse.json();
      const productPayload = productJson.data?.productSet;
      errors.push(...collectUserErrors(productPayload?.userErrors));
      productId = productPayload?.product?.id ?? productId;

      if (
        errors.length === 0 &&
        productContext.exists &&
        productId &&
        matchedVariant &&
        rowTouchesVariantPriceFields(row)
      ) {
        const variantResponse = await graphql(PRODUCT_VARIANTS_BULK_UPDATE, {
          variables: {
            productId,
            variants: [buildVariantBulkInput(row, matchedVariant.id)],
          },
        });
        const variantJson = await variantResponse.json();
        errors.push(
          ...collectUserErrors(
            variantJson.data?.productVariantsBulkUpdate?.userErrors,
          ),
        );
      }

      if (
        errors.length === 0 &&
        productContext.exists &&
        matchedVariant &&
        rowTouchesStock(row) &&
        locationId
      ) {
        const inventoryItemId = matchedVariant.inventoryItem?.id;
        if (!inventoryItemId) {
          errors.push(
            "La variante no tiene inventory item para actualizar stock.",
          );
        } else {
          const inventoryResponse = await graphql(INVENTORY_SET_QUANTITIES, {
            variables: {
              input: {
                name: "available",
                reason: "correction",
                quantities: [
                  {
                    inventoryItemId,
                    locationId,
                    quantity: Number.parseInt(row.stock, 10),
                    changeFromQuantity: null,
                  },
                ],
              },
            },
          });
          const inventoryJson = await inventoryResponse.json();
          errors.push(
            ...collectUserErrors(
              inventoryJson.data?.inventorySetQuantities?.userErrors,
            ),
          );
        }
      }

      if (errors.length > 0) {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: false,
          errors,
        });
      } else {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: true,
          productId,
          errors: [],
        });
      }
    } catch (err) {
      results.push({
        row: rowNum,
        handle: row.handle,
        success: false,
        errors: [err instanceof Error ? err.message : "Error desconocido"],
      });
    }
  }

  return { results, validationErrors };
}

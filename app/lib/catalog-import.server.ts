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

type ImportVariantContext = {
  variantId?: string;
  locationId?: string;
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

const PRIMARY_LOCATION_QUERY = `#graphql
  query ImportPrimaryLocation {
    locations(first: 1) {
      nodes {
        id
      }
    }
  }
`;

const PRODUCT_VARIANT_QUERY = `#graphql
  query ImportProductVariant($handle: String!) {
    productByHandle(handle: $handle) {
      variants(first: 1) {
        nodes {
          id
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

function rowTouchesVariantFields(row: CatalogRow): boolean {
  return (
    row.sku !== "" ||
    row.price !== "" ||
    row.stock !== "" ||
    row.compare_at_price !== "" ||
    row.barcode !== ""
  );
}

function buildProductSetInput(
  row: CatalogRow,
  metafields: { namespace: string; key: string; value: string }[],
  context: ImportVariantContext = {},
  metafieldTypes: Map<string, string> = new Map(),
) {
  const tags = row.tags
    ? row.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const variant: Record<string, unknown> = {
    optionValues: [{ optionName: "Title", name: "Default Title" }],
  };

  if (context.variantId) variant.id = context.variantId;
  if (row.sku !== "") variant.sku = row.sku;
  if (row.price !== "") variant.price = row.price;
  if (row.compare_at_price !== "") variant.compareAtPrice = row.compare_at_price;
  if (row.barcode !== "") variant.barcode = row.barcode;

  if (row.stock !== "" && context.locationId) {
    variant.inventoryQuantities = [
      {
        locationId: context.locationId,
        name: "available",
        quantity: Number.parseInt(row.stock, 10),
      },
    ];
  }

  const input: Record<string, unknown> = {
    handle: row.handle,
    title: row.title,
    productOptions: [
      { name: "Title", values: [{ name: "Default Title" }] },
    ],
    variants: [variant],
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

  return input;
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

async function fetchPrimaryLocationId(
  graphql: AdminGraphql,
): Promise<string | null> {
  const response = await graphql(PRIMARY_LOCATION_QUERY);
  const json = await response.json();
  return json.data?.locations?.nodes?.[0]?.id ?? null;
}

async function fetchVariantIdByHandle(
  graphql: AdminGraphql,
  handle: string,
): Promise<string | null> {
  const response = await graphql(PRODUCT_VARIANT_QUERY, {
    variables: { handle },
  });
  const json = await response.json();
  return json.data?.productByHandle?.variants?.nodes?.[0]?.id ?? null;
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
      allowedMetafieldHeaders.has(
        `metafield.${mf.namespace}.${mf.key}`,
      ),
    );

    try {
      let variantId: string | undefined;
      if (rowTouchesVariantFields(row)) {
        const existingVariantId = await fetchVariantIdByHandle(
          graphql,
          row.handle,
        );
        if (existingVariantId) variantId = existingVariantId;
      }

      const input = buildProductSetInput(
        row,
        metafields,
        {
          variantId,
          locationId: locationId ?? undefined,
        },
        metafieldTypes,
      );
      const response = await graphql(PRODUCT_SET, {
        variables: {
          synchronous: true,
          identifier: { handle: row.handle },
          input,
        },
      });
      const json = await response.json();
      const payload = json.data?.productSet;
      const userErrors =
        payload?.userErrors?.map(
          (e: { message: string }) => e.message,
        ) ?? [];

      if (userErrors.length > 0) {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: false,
          errors: userErrors,
        });
      } else {
        results.push({
          row: rowNum,
          handle: row.handle,
          success: true,
          productId: payload?.product?.id,
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

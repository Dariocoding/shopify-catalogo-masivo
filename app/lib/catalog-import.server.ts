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

const PRODUCT_SET = `#graphql
  mutation CatalogProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(input: $input, identifier: $identifier) {
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

function normalizeStatus(status: string): "ACTIVE" | "DRAFT" | "ARCHIVED" {
  const upper = status.trim().toUpperCase();
  if (upper === "DRAFT" || upper === "ARCHIVED") return upper;
  return "ACTIVE";
}

function buildProductSetInput(
  row: CatalogRow,
  metafields: { namespace: string; key: string; value: string }[],
) {
  const tags = row.tags
    ? row.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const variant: Record<string, unknown> = {
    optionValues: [{ optionName: "Title", name: "Default Title" }],
  };

  if (row.sku) variant.sku = row.sku;
  if (row.price) variant.price = row.price;
  if (row.compare_at_price) variant.compareAtPrice = row.compare_at_price;
  if (row.barcode) variant.barcode = row.barcode;

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
      type: "single_line_text_field",
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

export async function importCatalogBatch(
  graphql: AdminGraphql,
  parsed: ParsedCatalog,
  startIndex: number,
  batchSize = IMPORT_BATCH_SIZE,
): Promise<ImportBatchResult> {
  const validationErrors = [...parsed.errors];
  const results: ImportRowResult[] = [];
  const end = Math.min(startIndex + batchSize, parsed.rows.length);

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

    const metafields = metafieldsForRow(parsed, row);

    try {
      const input = buildProductSetInput(row, metafields);
      const response = await graphql(PRODUCT_SET, {
        variables: {
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

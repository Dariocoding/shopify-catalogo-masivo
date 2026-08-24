import {
  buildProductSearchQuery,
  type ExportFilters,
  EMPTY_EXPORT_FILTERS,
} from "./catalog-export-filters";
import {
  fetchCatalogProductMetafieldDefinitions,
  mergeMetafieldHeaders,
  metafieldHeadersFromDefinitions,
} from "./catalog-metafields.server";
import {
  EXPORT_PAGE_SIZE,
  metafieldHeader,
  type CatalogRow,
} from "./catalog-schema";

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

type ExportVariant = {
  id: string;
  sku: string | null;
  inventoryQuantity: number | null;
  price: string;
  compareAtPrice: string | null;
  barcode: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
};

type ExportProduct = {
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  variants: {
    nodes: ExportVariant[];
  };
  metafields: {
    nodes: Array<{
      namespace: string;
      key: string;
      value: string;
    }>;
  };
};

export type ExportResult = {
  rows: CatalogRow[];
  metafieldHeaders: string[];
  productCount: number;
};

export type SimpleExportResult = ExportResult & {
  multiVariantProductCount: number;
};

export type ExportSummary = {
  preview: CatalogRow[];
  productCount: number;
  metafieldHeaders: string[];
};

export type SimpleExportSummary = ExportSummary & {
  multiVariantProductCount: number;
};

export type ExportBatchResult = {
  rows: CatalogRow[];
  metafieldHeaders: string[];
  exportedCount: number;
  totalCount: number;
  hasMore: boolean;
  endCursor: string | null;
};

export type CollectionOption = {
  id: string;
  title: string;
};

const PRODUCT_FIELDS = `
  handle
  title
  descriptionHtml
  vendor
  productType
  status
  tags
  variants(first: 100) {
    nodes {
      id
      sku
      inventoryQuantity
      price
      compareAtPrice
      barcode
      selectedOptions {
        name
        value
      }
    }
  }
  metafields(first: 100) {
    nodes {
      namespace
      key
      value
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query CatalogExport($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${PRODUCT_FIELDS}
      }
    }
  }
`;

const PRODUCTS_COUNT_QUERY = `#graphql
  query CatalogExportCount($query: String) {
    productsCount(query: $query) {
      count
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query ExportCollections($first: Int!) {
    collections(first: $first, sortKey: TITLE) {
      nodes {
        id
        title
      }
    }
  }
`;

function formatVariantOptions(
  selectedOptions: Array<{ name: string; value: string }>,
): string {
  return selectedOptions
    .map((option) => `${option.name}: ${option.value}`)
    .join(" / ");
}

function productToRows(
  product: ExportProduct,
  metafieldHeaderSet: Set<string>,
  allowedMetafieldHeaders: Set<string>,
): CatalogRow[] {
  const variants =
    product.variants.nodes.length > 0
      ? product.variants.nodes
      : [
          {
            id: "",
            sku: null,
            inventoryQuantity: null,
            price: "",
            compareAtPrice: null,
            barcode: null,
            selectedOptions: [],
          } satisfies ExportVariant,
        ];

  const metafieldValues: Record<string, string> = {};
  for (const mf of product.metafields.nodes) {
    const header = metafieldHeader(mf.namespace, mf.key);
    if (!allowedMetafieldHeaders.has(header)) continue;
    metafieldHeaderSet.add(header);
    metafieldValues[header] = mf.value;
  }

  return variants.map((variant) => {
    const row: CatalogRow & Record<string, string> = {
      handle: product.handle,
      title: product.title,
      description_html: product.descriptionHtml ?? "",
      vendor: product.vendor ?? "",
      product_type: product.productType ?? "",
      status: product.status,
      tags: product.tags.join(", "),
      variant_id: variant.id ?? "",
      variant_options: formatVariantOptions(variant.selectedOptions ?? []),
      sku: variant.sku ?? "",
      stock:
        variant.inventoryQuantity != null
          ? String(variant.inventoryQuantity)
          : "",
      price: variant.price ?? "",
      compare_at_price: variant.compareAtPrice ?? "",
      barcode: variant.barcode ?? "",
      ...metafieldValues,
    };
    return row as CatalogRow;
  });
}

function productToSimpleRow(
  product: ExportProduct,
  metafieldHeaderSet: Set<string>,
  allowedMetafieldHeaders: Set<string>,
): CatalogRow {
  const variant =
    product.variants.nodes[0] ?? {
      id: "",
      sku: null,
      inventoryQuantity: null,
      price: "",
      compareAtPrice: null,
      barcode: null,
      selectedOptions: [],
    };

  const metafieldValues: Record<string, string> = {};
  for (const mf of product.metafields.nodes) {
    const header = metafieldHeader(mf.namespace, mf.key);
    if (!allowedMetafieldHeaders.has(header)) continue;
    metafieldHeaderSet.add(header);
    metafieldValues[header] = mf.value;
  }

  const row: CatalogRow & Record<string, string> = {
    handle: product.handle,
    title: product.title,
    description_html: product.descriptionHtml ?? "",
    vendor: product.vendor ?? "",
    product_type: product.productType ?? "",
    status: product.status,
    tags: product.tags.join(", "),
    variant_id: "",
    variant_options: "",
    sku: variant.sku ?? "",
    stock:
      variant.inventoryQuantity != null
        ? String(variant.inventoryQuantity)
        : "",
    price: variant.price ?? "",
    compare_at_price: variant.compareAtPrice ?? "",
    barcode: variant.barcode ?? "",
    ...metafieldValues,
  };
  return row as CatalogRow;
}

async function fetchProductPage(
  graphql: AdminGraphql,
  first: number,
  after: string | null,
  query?: string,
): Promise<{
  nodes: ExportProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  const response = await graphql(PRODUCTS_QUERY, {
    variables: { first, after, query: query ?? null },
  });
  const json = await response.json();
  const products = json.data?.products;

  return {
    nodes: (products?.nodes ?? []) as ExportProduct[],
    hasNextPage: Boolean(products?.pageInfo?.hasNextPage),
    endCursor: products?.pageInfo?.endCursor ?? null,
  };
}

async function getProductCount(
  graphql: AdminGraphql,
  query?: string,
): Promise<number> {
  const response = await graphql(PRODUCTS_COUNT_QUERY, {
    variables: { query: query ?? null },
  });
  const json = await response.json();
  return json.data?.productsCount?.count ?? 0;
}

export async function getCollectionOptions(
  graphql: AdminGraphql,
): Promise<CollectionOption[]> {
  const response = await graphql(COLLECTIONS_QUERY, {
    variables: { first: 100 },
  });
  const json = await response.json();
  return (json.data?.collections?.nodes ?? []) as CollectionOption[];
}

export async function getExportSummary(
  graphql: AdminGraphql,
  filters: ExportFilters = EMPTY_EXPORT_FILTERS,
  previewSize = 5,
): Promise<ExportSummary> {
  const query = buildProductSearchQuery(filters);
  const [totalCount, previewPage, definitions] = await Promise.all([
    getProductCount(graphql, query),
    fetchProductPage(graphql, previewSize, null, query),
    fetchCatalogProductMetafieldDefinitions(graphql),
  ]);

  const allowedMetafieldHeaders = new Set(
    metafieldHeadersFromDefinitions(definitions),
  );
  const metafieldHeaderSet = new Set(allowedMetafieldHeaders);
  const preview = previewPage.nodes.flatMap((product) =>
    productToRows(product, metafieldHeaderSet, allowedMetafieldHeaders),
  );

  return {
    preview,
    productCount: totalCount,
    metafieldHeaders: mergeMetafieldHeaders(definitions, metafieldHeaderSet),
  };
}

export async function getSimpleExportSummary(
  graphql: AdminGraphql,
  filters: ExportFilters = EMPTY_EXPORT_FILTERS,
  previewSize = 5,
): Promise<SimpleExportSummary> {
  const query = buildProductSearchQuery(filters);
  const [totalCount, previewPage, definitions] = await Promise.all([
    getProductCount(graphql, query),
    fetchProductPage(graphql, previewSize, null, query),
    fetchCatalogProductMetafieldDefinitions(graphql),
  ]);

  const allowedMetafieldHeaders = new Set(
    metafieldHeadersFromDefinitions(definitions),
  );
  const metafieldHeaderSet = new Set(allowedMetafieldHeaders);
  const preview = previewPage.nodes.map((product) =>
    productToSimpleRow(product, metafieldHeaderSet, allowedMetafieldHeaders),
  );
  const multiVariantProductCount = previewPage.nodes.filter(
    (product) => product.variants.nodes.length > 1,
  ).length;

  return {
    preview,
    productCount: totalCount,
    metafieldHeaders: mergeMetafieldHeaders(definitions, metafieldHeaderSet),
    multiVariantProductCount,
  };
}

export async function exportSimpleCatalog(
  graphql: AdminGraphql,
  filters: ExportFilters = EMPTY_EXPORT_FILTERS,
): Promise<SimpleExportResult> {
  const definitions = await fetchCatalogProductMetafieldDefinitions(graphql);
  const allowedMetafieldHeaders = new Set(
    metafieldHeadersFromDefinitions(definitions),
  );
  const metafieldHeaderSet = new Set(allowedMetafieldHeaders);
  const rows: CatalogRow[] = [];
  const query = buildProductSearchQuery(filters);
  let after: string | null = null;
  let hasNextPage = true;
  let productCount = 0;
  let multiVariantProductCount = 0;

  while (hasNextPage) {
    const page = await fetchProductPage(graphql, EXPORT_PAGE_SIZE, after, query);

    for (const product of page.nodes) {
      productCount += 1;
      if (product.variants.nodes.length > 1) {
        multiVariantProductCount += 1;
      }
      rows.push(
        productToSimpleRow(product, metafieldHeaderSet, allowedMetafieldHeaders),
      );
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return {
    rows,
    metafieldHeaders: mergeMetafieldHeaders(definitions, metafieldHeaderSet),
    productCount,
    multiVariantProductCount,
  };
}

export async function exportCatalogBatch(
  graphql: AdminGraphql,
  filters: ExportFilters,
  cursor: string | null,
  exportedSoFar: number,
  includeTotal = false,
  metafieldHeadersSeed: string[] = [],
): Promise<ExportBatchResult> {
  const query = buildProductSearchQuery(filters);
  const page = await fetchProductPage(
    graphql,
    EXPORT_PAGE_SIZE,
    cursor,
    query,
  );

  const metafieldHeaderSet = new Set<string>(metafieldHeadersSeed);
  const allowedMetafieldHeaders = new Set(metafieldHeadersSeed);
  const rows = page.nodes.flatMap((product) =>
    productToRows(product, metafieldHeaderSet, allowedMetafieldHeaders),
  );

  const exportedCount = exportedSoFar + page.nodes.length;
  const totalCount = includeTotal
    ? await getProductCount(graphql, query)
    : 0;

  return {
    rows,
    metafieldHeaders: [...metafieldHeaderSet].sort(),
    exportedCount,
    totalCount,
    hasMore: page.hasNextPage,
    endCursor: page.endCursor,
  };
}

export async function exportCatalog(
  graphql: AdminGraphql,
  filters: ExportFilters = EMPTY_EXPORT_FILTERS,
): Promise<ExportResult> {
  const definitions = await fetchCatalogProductMetafieldDefinitions(graphql);
  const allowedMetafieldHeaders = new Set(
    metafieldHeadersFromDefinitions(definitions),
  );
  const metafieldHeaderSet = new Set(allowedMetafieldHeaders);
  const rows: CatalogRow[] = [];
  const query = buildProductSearchQuery(filters);
  let after: string | null = null;
  let hasNextPage = true;
  let productCount = 0;

  while (hasNextPage) {
    const page = await fetchProductPage(graphql, EXPORT_PAGE_SIZE, after, query);

    for (const product of page.nodes) {
      productCount += 1;
      rows.push(
        ...productToRows(product, metafieldHeaderSet, allowedMetafieldHeaders),
      );
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return {
    rows,
    metafieldHeaders: mergeMetafieldHeaders(definitions, metafieldHeaderSet),
    productCount,
  };
}

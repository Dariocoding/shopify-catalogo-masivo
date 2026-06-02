import {
  buildProductSearchQuery,
  type ExportFilters,
  EMPTY_EXPORT_FILTERS,
} from "./catalog-export-filters";
import {
  EXPORT_PAGE_SIZE,
  metafieldHeader,
  type CatalogRow,
} from "./catalog-schema";

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

type ExportProduct = {
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  variants: {
    nodes: Array<{
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      barcode: string | null;
    }>;
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

export type ExportSummary = {
  preview: CatalogRow[];
  productCount: number;
  metafieldHeaders: string[];
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
  variants(first: 1) {
    nodes {
      sku
      price
      compareAtPrice
      barcode
    }
  }
  metafields(first: 25) {
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

function productToRow(
  product: ExportProduct,
  metafieldHeaderSet: Set<string>,
): CatalogRow {
  const variant = product.variants.nodes[0];
  const row: CatalogRow & Record<string, string> = {
    handle: product.handle,
    title: product.title,
    description_html: product.descriptionHtml ?? "",
    vendor: product.vendor ?? "",
    product_type: product.productType ?? "",
    status: product.status,
    tags: product.tags.join(", "),
    sku: variant?.sku ?? "",
    price: variant?.price ?? "",
    compare_at_price: variant?.compareAtPrice ?? "",
    barcode: variant?.barcode ?? "",
  };

  for (const mf of product.metafields.nodes) {
    const header = metafieldHeader(mf.namespace, mf.key);
    metafieldHeaderSet.add(header);
    row[header] = mf.value;
  }

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
  const [totalCount, previewPage] = await Promise.all([
    getProductCount(graphql, query),
    fetchProductPage(graphql, previewSize, null, query),
  ]);

  const metafieldHeaderSet = new Set<string>();
  const preview = previewPage.nodes.map((product) =>
    productToRow(product, metafieldHeaderSet),
  );

  return {
    preview,
    productCount: totalCount,
    metafieldHeaders: [...metafieldHeaderSet].sort(),
  };
}

export async function exportCatalogBatch(
  graphql: AdminGraphql,
  filters: ExportFilters,
  cursor: string | null,
  exportedSoFar: number,
  includeTotal = false,
): Promise<ExportBatchResult> {
  const query = buildProductSearchQuery(filters);
  const page = await fetchProductPage(
    graphql,
    EXPORT_PAGE_SIZE,
    cursor,
    query,
  );

  const metafieldHeaderSet = new Set<string>();
  const rows = page.nodes.map((product) =>
    productToRow(product, metafieldHeaderSet),
  );

  const exportedCount = exportedSoFar + rows.length;
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
  const metafieldHeaderSet = new Set<string>();
  const rows: CatalogRow[] = [];
  const query = buildProductSearchQuery(filters);
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await fetchProductPage(graphql, EXPORT_PAGE_SIZE, after, query);

    for (const product of page.nodes) {
      rows.push(productToRow(product, metafieldHeaderSet));
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return {
    rows,
    metafieldHeaders: [...metafieldHeaderSet].sort(),
    productCount: rows.length,
  };
}

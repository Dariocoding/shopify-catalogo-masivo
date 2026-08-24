import {
  buildProductSearchQuery,
  type ExportFilters,
  EMPTY_EXPORT_FILTERS,
} from "./catalog-export-filters";
import type {
  VariantEditorAddOptionRequest,
  VariantEditorAddOptionResult,
  VariantEditorChange,
  VariantEditorCreateInput,
  VariantEditorCreateRequest,
  VariantEditorCreateResult,
  VariantEditorDeleteRequest,
  VariantEditorDeleteResult,
  VariantEditorOption,
  VariantEditorPage,
  VariantEditorProduct,
  VariantEditorRenameOptionChange,
  VariantEditorRenameOptionsRequest,
  VariantEditorRenameOptionsResult,
  VariantEditorSaveResult,
  VariantEditorVariant,
} from "./catalog-variant-editor.shared";

export type {
  VariantEditorAddOptionRequest,
  VariantEditorAddOptionResult,
  VariantEditorChange,
  VariantEditorCreateInput,
  VariantEditorCreateRequest,
  VariantEditorCreateResult,
  VariantEditorDeleteRequest,
  VariantEditorDeleteResult,
  VariantEditorOption,
  VariantEditorOptionValue,
  VariantEditorPage,
  VariantEditorProduct,
  VariantEditorRenameOptionChange,
  VariantEditorRenameOptionsRequest,
  VariantEditorRenameOptionsResult,
  VariantEditorSaveResult,
  VariantEditorVariant,
} from "./catalog-variant-editor.shared";

export {
  buildVariantCombinations,
  canAddSecondOption,
  getEditableOptions,
  isSimpleProduct,
} from "./catalog-variant-editor.shared";

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

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
        vendor
        status
        productType
        tags
        hasOnlyDefaultVariant
        options {
          id
          name
          optionValues {
            id
            name
          }
        }
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
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
            image {
              url
              altText
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

const PRODUCT_OPTION_UPDATE = `#graphql
  mutation VariantEditorOptionUpdate(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToUpdate: [OptionValueUpdateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToUpdate: $optionValuesToUpdate
    ) {
      product {
        id
        hasOnlyDefaultVariant
        options {
          id
          name
          optionValues {
            id
            name
          }
        }
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
            image {
              url
              altText
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_OPTIONS_CREATE = `#graphql
  mutation VariantEditorOptionsCreate(
    $productId: ID!
    $options: [OptionCreateInput!]!
    $variantStrategy: ProductOptionCreateVariantStrategy
  ) {
    productOptionsCreate(
      productId: $productId
      options: $options
      variantStrategy: $variantStrategy
    ) {
      product {
        id
        hasOnlyDefaultVariant
        options {
          id
          name
          optionValues {
            id
            name
          }
        }
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
            image {
              url
              altText
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_CREATE = `#graphql
  mutation VariantEditorBulkCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
    $strategy: ProductVariantsBulkCreateStrategy
  ) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: $strategy
    ) {
      product {
        id
        hasOnlyDefaultVariant
        options {
          id
          name
          optionValues {
            id
            name
          }
        }
      }
      productVariants {
        id
        sku
        price
        compareAtPrice
        barcode
        inventoryQuantity
        inventoryItem {
          id
        }
        image {
          url
          altText
        }
        selectedOptions {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_DELETE = `#graphql
  mutation VariantEditorBulkDelete(
    $productId: ID!
    $variantsIds: [ID!]!
  ) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      product {
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

function mapOptions(
  options: Array<{
    id: string;
    name: string;
    optionValues: Array<{ id: string; name: string }>;
  }>,
): VariantEditorOption[] {
  return options.map((option) => ({
    id: option.id,
    name: option.name,
    values: option.optionValues.map((value) => value.name),
    valueEntries: option.optionValues.map((value) => ({
      id: value.id,
      name: value.name,
    })),
  }));
}

function mapVariantNode(
  variant: {
    id: string;
    sku: string | null;
    price: string;
    compareAtPrice: string | null;
    barcode: string | null;
    inventoryQuantity: number | null;
    inventoryItem: { id: string } | null;
    image: { url: string; altText: string | null } | null;
    selectedOptions: Array<{ name: string; value: string }>;
  },
  fallbackAlt: string,
): VariantEditorVariant {
  return {
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
    imageUrl: variant.image?.url ?? null,
    imageAlt: variant.image?.altText ?? fallbackAlt,
  };
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
  vendor: string | null;
  status: string;
  productType: string;
  tags: string[];
  featuredMedia: {
    preview: { image: { url: string; altText: string | null } | null } | null;
  } | null;
  hasOnlyDefaultVariant: boolean;
  options: Array<{
    id: string;
    name: string;
    optionValues: Array<{ id: string; name: string }>;
  }>;
  variants: {
    nodes: Array<{
      id: string;
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      barcode: string | null;
      inventoryQuantity: number | null;
      inventoryItem: { id: string } | null;
      image: { url: string; altText: string | null } | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
}): VariantEditorProduct {
  const productImage = node.featuredMedia?.preview?.image;

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    vendor: node.vendor ?? "",
    status: node.status,
    productType: node.productType ?? "",
    tags: node.tags ?? [],
    imageUrl: productImage?.url ?? null,
    imageAlt: productImage?.altText ?? node.title,
    options: mapOptions(node.options ?? []),
    hasOnlyDefaultVariant: node.hasOnlyDefaultVariant ?? false,
    variants: node.variants.nodes.map((variant) =>
      mapVariantNode(variant, node.title),
    ),
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

function buildVariantCreateInput(
  input: VariantEditorCreateInput,
): Record<string, unknown> {
  const variant: Record<string, unknown> = {
    optionValues: input.optionValues.map((optionValue) => ({
      optionName: optionValue.optionName,
      name: optionValue.value,
    })),
  };

  if (input.price !== "") variant.price = input.price;
  if (input.compareAtPrice !== "") {
    variant.compareAtPrice = input.compareAtPrice;
  }
  if (input.barcode !== "") variant.barcode = input.barcode;
  if (input.sku !== "") {
    variant.inventoryItem = { sku: input.sku };
  }

  return variant;
}

export async function createVariantEditorVariants(
  graphql: AdminGraphql,
  request: VariantEditorCreateRequest,
): Promise<VariantEditorCreateResult> {
  if (request.variants.length === 0) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: ["Indica al menos una variante para crear."],
      variants: [],
      options: [],
      hasOnlyDefaultVariant: request.hasOnlyDefaultVariant,
    };
  }

  const needsStock = request.variants.some(
    (variant) => variant.stock.trim() !== "",
  );
  const locationId = needsStock ? await fetchPrimaryLocationId(graphql) : null;

  const response = await graphql(PRODUCT_VARIANTS_BULK_CREATE, {
    variables: {
      productId: request.productId,
      variants: request.variants.map(buildVariantCreateInput),
      strategy: request.hasOnlyDefaultVariant ? "REMOVE_STANDALONE_VARIANT" : null,
    },
  });
  const json = await response.json();
  const payload = json.data?.productVariantsBulkCreate;
  const userErrors = collectUserErrors(payload?.userErrors);

  if (userErrors.length > 0) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: userErrors,
      variants: [],
      options: mapOptions(payload?.product?.options ?? []),
      hasOnlyDefaultVariant:
        payload?.product?.hasOnlyDefaultVariant ?? request.hasOnlyDefaultVariant,
    };
  }

  const createdVariants = (payload?.productVariants ?? []).map(
    (variant: {
      id: string;
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      barcode: string | null;
      inventoryQuantity: number | null;
      inventoryItem: { id: string } | null;
      image: { url: string; altText: string | null } | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }) => mapVariantNode(variant, request.handle),
  );

  const stockErrors: string[] = [];
  if (locationId) {
    for (const [index, input] of request.variants.entries()) {
      if (input.stock.trim() === "") continue;

      const createdVariant = createdVariants[index];
      if (!createdVariant?.inventoryItemId) {
        stockErrors.push(
          `No se pudo asignar stock a "${createdVariant?.label ?? "la variante"}".`,
        );
        continue;
      }

      const inventoryResponse = await graphql(INVENTORY_SET_QUANTITIES, {
        variables: {
          input: {
            name: "available",
            reason: "correction",
            quantities: [
              {
                inventoryItemId: createdVariant.inventoryItemId,
                locationId,
                quantity: Number.parseInt(input.stock, 10),
                changeFromQuantity: null,
              },
            ],
          },
        },
      });
      const inventoryJson = await inventoryResponse.json();
      const inventoryErrors = collectUserErrors(
        inventoryJson.data?.inventorySetQuantities?.userErrors,
      );
      stockErrors.push(...inventoryErrors);

      if (inventoryErrors.length === 0) {
        createdVariant.stock = input.stock;
      }
    }
  } else if (needsStock) {
    stockErrors.push("No se encontró ubicación de inventario.");
  }

  return {
    productId: request.productId,
    handle: request.handle,
    success: stockErrors.length === 0,
    errors: stockErrors,
    variants: createdVariants,
    options: mapOptions(payload?.product?.options ?? []),
    hasOnlyDefaultVariant:
      payload?.product?.hasOnlyDefaultVariant ?? false,
  };
}

export async function addVariantEditorOption(
  graphql: AdminGraphql,
  request: VariantEditorAddOptionRequest,
): Promise<VariantEditorAddOptionResult> {
  const optionName = request.optionName.trim();
  const values = request.values.map((value) => value.trim()).filter(Boolean);

  if (!optionName) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: ["Indica el nombre de la nueva opción (por ejemplo, Color)."],
      variants: [],
      options: [],
      hasOnlyDefaultVariant: false,
    };
  }

  if (values.length === 0) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: ["Indica al menos un valor para la nueva opción."],
      variants: [],
      options: [],
      hasOnlyDefaultVariant: false,
    };
  }

  const response = await graphql(PRODUCT_OPTIONS_CREATE, {
    variables: {
      productId: request.productId,
      options: [
        {
          name: optionName,
          values: values.map((name) => ({ name })),
        },
      ],
      variantStrategy: "CREATE",
    },
  });
  const json = await response.json();
  const payload = json.data?.productOptionsCreate;
  const userErrors = collectUserErrors(payload?.userErrors);

  if (userErrors.length > 0) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: userErrors,
      variants: [],
      options: mapOptions(payload?.product?.options ?? []),
      hasOnlyDefaultVariant:
        payload?.product?.hasOnlyDefaultVariant ?? false,
    };
  }

  const product = payload?.product;
  const variants = (product?.variants?.nodes ?? []).map(
    (variant: {
      id: string;
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      barcode: string | null;
      inventoryQuantity: number | null;
      inventoryItem: { id: string } | null;
      image: { url: string; altText: string | null } | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }) => mapVariantNode(variant, request.handle),
  );

  return {
    productId: request.productId,
    handle: request.handle,
    success: true,
    errors: [],
    variants,
    options: mapOptions(product?.options ?? []),
    hasOnlyDefaultVariant: product?.hasOnlyDefaultVariant ?? false,
  };
}

export async function renameVariantEditorOptions(
  graphql: AdminGraphql,
  request: VariantEditorRenameOptionsRequest,
): Promise<VariantEditorRenameOptionsResult> {
  const changes = request.changes
    .map((change) => ({
      optionId: change.optionId,
      name: change.name?.trim(),
      valueChanges: (change.valueChanges ?? [])
        .map((valueChange) => ({
          valueId: valueChange.valueId,
          name: valueChange.name.trim(),
        }))
        .filter((valueChange) => valueChange.name.length > 0),
    }))
    .filter(
      (change) =>
        Boolean(change.name) || (change.valueChanges?.length ?? 0) > 0,
    );

  if (changes.length === 0) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: ["No hay cambios para guardar."],
      options: [],
      variants: [],
    };
  }

  const errors: string[] = [];
  let latestProduct:
    | {
        options: Array<{
          id: string;
          name: string;
          optionValues: Array<{ id: string; name: string }>;
        }>;
        variants: {
          nodes: Array<{
            id: string;
            sku: string | null;
            price: string;
            compareAtPrice: string | null;
            barcode: string | null;
            inventoryQuantity: number | null;
            inventoryItem: { id: string } | null;
            image: { url: string; altText: string | null } | null;
            selectedOptions: Array<{ name: string; value: string }>;
          }>;
        };
      }
    | null = null;

  for (const change of changes) {
    const option: Record<string, unknown> = { id: change.optionId };
    if (change.name) {
      option.name = change.name;
    }

    const response = await graphql(PRODUCT_OPTION_UPDATE, {
      variables: {
        productId: request.productId,
        option,
        optionValuesToUpdate:
          change.valueChanges && change.valueChanges.length > 0
            ? change.valueChanges.map((valueChange) => ({
                id: valueChange.valueId,
                name: valueChange.name,
              }))
            : null,
      },
    });
    const json = await response.json();
    const payload = json.data?.productOptionUpdate;
    const userErrors = collectUserErrors(payload?.userErrors);

    if (userErrors.length > 0) {
      errors.push(...userErrors);
      continue;
    }

    if (payload?.product) {
      latestProduct = payload.product;
    }
  }

  if (!latestProduct) {
    return {
      productId: request.productId,
      handle: request.handle,
      success: false,
      errors: errors.length > 0 ? errors : ["No se pudieron actualizar las opciones."],
      options: [],
      variants: [],
    };
  }

  const variants = (latestProduct.variants?.nodes ?? []).map((variant) =>
    mapVariantNode(variant, request.handle),
  );

  return {
    productId: request.productId,
    handle: request.handle,
    success: errors.length === 0,
    errors,
    options: mapOptions(latestProduct.options ?? []),
    variants,
  };
}

export async function deleteVariantEditorVariants(
  graphql: AdminGraphql,
  deletions: VariantEditorDeleteRequest[],
): Promise<VariantEditorDeleteResult[]> {
  const results: VariantEditorDeleteResult[] = [];
  const byProduct = new Map<string, VariantEditorDeleteRequest[]>();

  for (const deletion of deletions) {
    const list = byProduct.get(deletion.productId) ?? [];
    list.push(deletion);
    byProduct.set(deletion.productId, list);
  }

  for (const [productId, productDeletions] of byProduct) {
    const response = await graphql(PRODUCT_VARIANTS_BULK_DELETE, {
      variables: {
        productId,
        variantsIds: productDeletions.map((deletion) => deletion.variantId),
      },
    });
    const json = await response.json();
    const userErrors = collectUserErrors(
      json.data?.productVariantsBulkDelete?.userErrors,
    );

    for (const deletion of productDeletions) {
      results.push({
        variantId: deletion.variantId,
        handle: deletion.handle,
        success: userErrors.length === 0,
        errors: userErrors,
      });
    }
  }

  return results;
}

export { VARIANT_EDITOR_PAGE_SIZE };

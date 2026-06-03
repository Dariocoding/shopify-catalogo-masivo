import { metafieldHeader, parseMetafieldHeader } from "./catalog-schema";

/** Nombres visibles en Admin que se incluyen en export/import masivo. */
const ALLOWED_METAFIELD_NAMES = new Set(["precio usd"]);

/** Metafields que no existen para esta app: ni export, ni import, ni parseo. */
const EXCLUDED_METAFIELD_HEADERS = new Set(["metafield.custom.banner"]);

export function isExcludedCatalogMetafieldHeader(header: string): boolean {
  if (EXCLUDED_METAFIELD_HEADERS.has(header)) return true;
  const parsed = parseMetafieldHeader(header);
  return parsed?.namespace === "custom" && parsed.key === "banner";
}

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

export type ProductMetafieldDefinition = {
  name: string;
  namespace: string;
  key: string;
  type: string;
};

const METAFIELD_DEFINITIONS_QUERY = `#graphql
  query ProductMetafieldDefinitions($first: Int!, $after: String) {
    metafieldDefinitions(ownerType: PRODUCT, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        namespace
        key
        type {
          name
        }
      }
    }
  }
`;

export async function fetchProductMetafieldDefinitions(
  graphql: AdminGraphql,
): Promise<ProductMetafieldDefinition[]> {
  const definitions: ProductMetafieldDefinition[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await graphql(METAFIELD_DEFINITIONS_QUERY, {
      variables: { first: 100, after },
    });
    const json = await response.json();
    const connection = json.data?.metafieldDefinitions;

    for (const node of connection?.nodes ?? []) {
      if (!node?.namespace || !node?.key) continue;
      definitions.push({
        name: node.name ?? node.key,
        namespace: node.namespace,
        key: node.key,
        type: node.type?.name ?? "single_line_text_field",
      });
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor ?? null;
  }

  return definitions;
}

export function isAllowedCatalogMetafield(
  definition: ProductMetafieldDefinition,
): boolean {
  const header = metafieldHeader(definition.namespace, definition.key);
  if (isExcludedCatalogMetafieldHeader(header)) return false;
  return ALLOWED_METAFIELD_NAMES.has(definition.name.trim().toLowerCase());
}

export function filterCatalogMetafieldDefinitions(
  definitions: ProductMetafieldDefinition[],
): ProductMetafieldDefinition[] {
  return definitions.filter(isAllowedCatalogMetafield);
}

export async function fetchCatalogProductMetafieldDefinitions(
  graphql: AdminGraphql,
): Promise<ProductMetafieldDefinition[]> {
  const definitions = await fetchProductMetafieldDefinitions(graphql);
  return filterCatalogMetafieldDefinitions(definitions);
}

export function metafieldHeadersFromDefinitions(
  definitions: ProductMetafieldDefinition[],
): string[] {
  return filterCatalogMetafieldDefinitions(definitions)
    .map((definition) =>
      metafieldHeader(definition.namespace, definition.key),
    )
    .sort();
}

export function mergeMetafieldHeaders(
  definitions: ProductMetafieldDefinition[],
  discovered: Iterable<string>,
): string[] {
  const allowedFromDefinitions = new Set(
    metafieldHeadersFromDefinitions(definitions),
  );
  const headers = new Set(allowedFromDefinitions);
  for (const header of discovered) {
    if (
      allowedFromDefinitions.has(header) &&
      !isExcludedCatalogMetafieldHeader(header)
    ) {
      headers.add(header);
    }
  }
  return [...headers].sort();
}

export function buildMetafieldTypeMap(
  definitions: ProductMetafieldDefinition[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const definition of definitions) {
    map.set(
      `${definition.namespace}.${definition.key}`,
      definition.type,
    );
  }
  return map;
}

export function metafieldDefinitionLabel(
  definitions: ProductMetafieldDefinition[],
  header: string,
): string | null {
  const prefix = "metafield.";
  if (!header.startsWith(prefix)) return null;
  const rest = header.slice(prefix.length);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  const namespace = rest.slice(0, dot);
  const key = rest.slice(dot + 1);
  const definition = definitions.find(
    (item) => item.namespace === namespace && item.key === key,
  );
  return definition?.name ?? null;
}

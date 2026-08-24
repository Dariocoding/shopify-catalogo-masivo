import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData, useSearchParams } from "react-router";

import { CatalogFiltersPanel } from "../components/catalog-filters";
import {
  CatalogBodyText,
  CatalogField,
  CatalogHero,
  CatalogInput,
  CatalogPage,
  CatalogProgress,
  CatalogSectionBlock,
  CatalogStepActions,
} from "../components/catalog-ui";
import {
  draftsEqual,
  VariantEditorTable,
  variantToDraft,
  type VariantEditorDraft,
} from "../components/variant-editor-table";
import {
  describeExportFilters,
  EMPTY_EXPORT_FILTERS,
  parseExportFilters,
  type ExportFilters,
} from "../lib/catalog-export-filters";
import { getCollectionOptions } from "../lib/catalog-export.server";
import {
  applyVariantEditorChanges,
  fetchVariantEditorPage,
  VARIANT_EDITOR_PAGE_SIZE,
  type VariantEditorChange,
  type VariantEditorProduct,
  type VariantEditorSaveResult,
} from "../lib/catalog-variant-editor.server";
import { authenticate } from "../shopify.server";

type LoaderData = {
  products: VariantEditorProduct[];
  totalCount: number;
  hasMore: boolean;
  endCursor: string | null;
  filters: ExportFilters;
  search: string;
  collections: Awaited<ReturnType<typeof getCollectionOptions>>;
};

type SaveActionData = {
  intent: "save";
  results: VariantEditorSaveResult[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseExportFilters(url.searchParams.get("filters"));
  const search = String(url.searchParams.get("search") ?? "").trim();
  const cursor = url.searchParams.get("cursor");

  const [collections, page] = await Promise.all([
    getCollectionOptions(admin.graphql),
    fetchVariantEditorPage(
      admin.graphql,
      filters,
      search,
      cursor,
      VARIANT_EDITOR_PAGE_SIZE,
    ),
  ]);

  return {
    products: page.products,
    totalCount: page.totalCount,
    hasMore: page.hasMore,
    endCursor: page.endCursor,
    filters,
    search,
    collections,
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "save") {
    const changesJson = String(formData.get("changes") ?? "[]");
    const originalsJson = String(formData.get("originals") ?? "{}");

    let changes: VariantEditorChange[] = [];
    let originalsRecord: Record<
      string,
      VariantEditorDraft & { handle: string; inventoryItemId: string | null }
    > = {};

    try {
      changes = JSON.parse(changesJson) as VariantEditorChange[];
      originalsRecord = JSON.parse(originalsJson) as typeof originalsRecord;
    } catch {
      return Response.json({ error: "Datos de guardado inválidos." }, { status: 400 });
    }

    const originals = new Map(
      Object.entries(originalsRecord).map(([variantId, value]) => [
        variantId,
        value,
      ]),
    );

    const results = await applyVariantEditorChanges(
      admin.graphql,
      changes,
      originals,
    );

    return Response.json({ intent: "save", results } satisfies SaveActionData);
  }

  return Response.json({ error: "Acción no reconocida." }, { status: 400 });
};

function buildOriginalsMap(products: VariantEditorProduct[]) {
  const map: Record<
    string,
    VariantEditorDraft & { handle: string; inventoryItemId: string | null }
  > = {};

  for (const product of products) {
    for (const variant of product.variants) {
      map[variant.id] = {
        ...variantToDraft(variant),
        handle: product.handle,
        inventoryItemId: variant.inventoryItemId,
      };
    }
  }

  return map;
}

function buildInitialDrafts(products: VariantEditorProduct[]) {
  const drafts: Record<string, VariantEditorDraft> = {};
  for (const product of products) {
    for (const variant of product.variants) {
      drafts[variant.id] = variantToDraft(variant);
    }
  }
  return drafts;
}

function buildInitialExpanded(products: VariantEditorProduct[]) {
  const expanded: Record<string, boolean> = {};
  for (const product of products) {
    expanded[product.id] = product.variants.length <= 1;
  }
  return expanded;
}

export default function VariantsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const loadMoreFetcher = useFetcher<typeof loader>();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState(loaderData.products);
  const [originals, setOriginals] = useState(() =>
    buildOriginalsMap(loaderData.products),
  );
  const [drafts, setDrafts] = useState(() =>
    buildInitialDrafts(loaderData.products),
  );
  const [expanded, setExpanded] = useState(() =>
    buildInitialExpanded(loaderData.products),
  );
  const [filters, setFilters] = useState<ExportFilters>(loaderData.filters);
  const [search, setSearch] = useState(loaderData.search);
  const [hasMore, setHasMore] = useState(loaderData.hasMore);
  const [endCursor, setEndCursor] = useState(loaderData.endCursor);
  const [saveResults, setSaveResults] = useState<VariantEditorSaveResult[]>([]);

  const collectionTitles = useMemo(
    () =>
      Object.fromEntries(
        loaderData.collections.map((collection) => [
          collection.id,
          collection.title,
        ]),
      ),
    [loaderData.collections],
  );

  const filtersLabel = useMemo(
    () => describeExportFilters(filters, collectionTitles),
    [filters, collectionTitles],
  );

  const hasActiveFilters =
    Boolean(filters.collectionId) ||
    Boolean(filters.vendor) ||
    Boolean(filters.status) ||
    Boolean(filters.tag) ||
    Boolean(search.trim());

  const dirtyVariantIds = useMemo(() => {
    const dirty = new Set<string>();
    for (const [variantId, draft] of Object.entries(drafts)) {
      const original = originals[variantId];
      if (original && !draftsEqual(draft, original)) {
        dirty.add(variantId);
      }
    }
    return dirty;
  }, [drafts, originals]);

  const isSaving = fetcher.state !== "idle";
  const isLoadingMore = loadMoreFetcher.state !== "idle";

  useEffect(() => {
    setProducts(loaderData.products);
    setOriginals(buildOriginalsMap(loaderData.products));
    setDrafts(buildInitialDrafts(loaderData.products));
    setExpanded(buildInitialExpanded(loaderData.products));
    setHasMore(loaderData.hasMore);
    setEndCursor(loaderData.endCursor);
    setFilters(loaderData.filters);
    setSearch(loaderData.search);
    setSaveResults([]);
  }, [loaderData]);

  useEffect(() => {
    if (loadMoreFetcher.state !== "idle" || !loadMoreFetcher.data) return;

    const data = loadMoreFetcher.data as LoaderData;
    setProducts((current) => [...current, ...data.products]);
    setOriginals((current) => ({
      ...current,
      ...buildOriginalsMap(data.products),
    }));
    setDrafts((current) => ({
      ...current,
      ...buildInitialDrafts(data.products),
    }));
    setExpanded((current) => ({
      ...current,
      ...buildInitialExpanded(data.products),
    }));
    setHasMore(data.hasMore);
    setEndCursor(data.endCursor);
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data as SaveActionData | { error?: string };
    if ("error" in data && data.error) {
      shopify.toast.show(data.error, { isError: true });
      return;
    }
    if ("intent" in data && data.intent === "save") {
      setSaveResults(data.results);
      const failed = data.results.filter((result) => !result.success).length;
      const ok = data.results.filter((result) => result.success).length;
      shopify.toast.show(
        failed > 0
          ? `Guardado: ${ok} correctos, ${failed} con error`
          : `Guardado: ${ok} variantes actualizadas`,
        failed > 0 ? { isError: true } : undefined,
      );

      if (ok > 0) {
        setOriginals((current) => {
          const next = { ...current };
          for (const result of data.results) {
            if (!result.success) continue;
            const draft = drafts[result.variantId];
            if (draft && next[result.variantId]) {
              next[result.variantId] = { ...next[result.variantId], ...draft };
            }
          }
          return next;
        });
      }
    }
  }, [fetcher.state, fetcher.data, shopify, drafts]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    params.set("filters", JSON.stringify(filters));
    if (search.trim()) params.set("search", search.trim());
    setSearchParams(params);
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_EXPORT_FILTERS });
    setSearch("");
    setSearchParams(new URLSearchParams());
  };

  const loadMore = () => {
    if (!hasMore || !endCursor || isLoadingMore) return;
    const params = new URLSearchParams(searchParams);
    params.set("cursor", endCursor);
    loadMoreFetcher.load(`?${params.toString()}`);
  };

  const onDraftChange = useCallback(
    (variantId: string, field: keyof VariantEditorDraft, value: string) => {
      setDrafts((current) => ({
        ...current,
        [variantId]: {
          ...(current[variantId] ?? {
            sku: "",
            price: "",
            compareAtPrice: "",
            stock: "",
            barcode: "",
          }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const onToggleProduct = (productId: string) => {
    setExpanded((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  };

  const onExpandAll = () => {
    setExpanded(
      Object.fromEntries(products.map((product) => [product.id, true])),
    );
  };

  const onCollapseAll = () => {
    setExpanded(
      Object.fromEntries(
        products.map((product) => [
          product.id,
          product.variants.length <= 1,
        ]),
      ),
    );
  };

  const saveChanges = () => {
    if (dirtyVariantIds.size === 0) {
      shopify.toast.show("No hay cambios para guardar.", { isError: true });
      return;
    }

    const changes: VariantEditorChange[] = [];
    for (const variantId of dirtyVariantIds) {
      const draft = drafts[variantId];
      const original = originals[variantId];
      if (!draft || !original) continue;

      let productId = "";
      for (const product of products) {
        if (product.variants.some((variant) => variant.id === variantId)) {
          productId = product.id;
          break;
        }
      }
      if (!productId) continue;

      changes.push({
        productId,
        variantId,
        sku: draft.sku,
        price: draft.price,
        compareAtPrice: draft.compareAtPrice,
        stock: draft.stock,
        barcode: draft.barcode,
      });
    }

    const formData = new FormData();
    formData.set("intent", "save");
    formData.set("changes", JSON.stringify(changes));
    formData.set("originals", JSON.stringify(originals));
    setSaveResults([]);
    fetcher.submit(formData, { method: "post" });
  };

  const loadedCount = products.length;
  const totalCount = loaderData.totalCount || loadedCount;

  return (
    <s-page heading="Variantes">
      <Link to="/app" style={{ textDecoration: "none" }}>
        <s-button slot="primary-action">Volver al inicio</s-button>
      </Link>

      <CatalogPage>
        <CatalogHero
          title="Editor de variantes"
          description="Edita precio, stock, SKU y código de barras directamente en tablas. Sin Excel."
          stat={`${loadedCount.toLocaleString("es")} de ${totalCount.toLocaleString("es")} productos`}
        />

        <CatalogFiltersPanel
          filters={filters}
          collections={loaderData.collections}
          filtersLabel={filtersLabel}
          hasActiveFilters={hasActiveFilters}
          disabled={isSaving || isLoadingMore}
          onFilterChange={(key, value) =>
            setFilters((current) => ({ ...current, [key]: value }))
          }
          onClear={clearFilters}
        />

        <CatalogField label="Buscar por título">
          <CatalogInput
            value={search}
            disabled={isSaving || isLoadingMore}
            placeholder="Ej. medicube, protector solar…"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </CatalogField>

        <CatalogStepActions>
          <s-button
            variant="primary"
            onClick={applyFilters}
            {...(isSaving || isLoadingMore ? { loading: true } : {})}
          >
            Aplicar filtros
          </s-button>
          {dirtyVariantIds.size > 0 && (
            <s-button
              onClick={saveChanges}
              {...(isSaving ? { loading: true } : {})}
            >
              Guardar {dirtyVariantIds.size} cambio
              {dirtyVariantIds.size === 1 ? "" : "s"}
            </s-button>
          )}
        </CatalogStepActions>

        {isSaving && (
          <CatalogProgress
            label="Guardando cambios en Shopify…"
            percent={60}
          />
        )}

        <VariantEditorTable
          products={products}
          drafts={drafts}
          expanded={expanded}
          dirtyVariantIds={dirtyVariantIds}
          disabled={isSaving || isLoadingMore}
          onToggleProduct={onToggleProduct}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
          onDraftChange={onDraftChange}
        />

        {hasMore && (
          <CatalogStepActions>
            <s-button
              onClick={loadMore}
              {...(isLoadingMore ? { loading: true } : {})}
            >
              Cargar más productos
            </s-button>
          </CatalogStepActions>
        )}

        {saveResults.length > 0 && (
          <s-section heading="Resultado del guardado">
            <CatalogSectionBlock>
              <CatalogBodyText>
                {saveResults.filter((result) => result.success).length} correctos
                , {saveResults.filter((result) => !result.success).length} con
                error.
              </CatalogBodyText>
              <div className="catalog-result-table">
                <s-box padding="base" background="subdued" borderRadius="base">
                  <table className="variant-editor__results">
                    <thead>
                      <tr>
                        <th>Handle</th>
                        <th>Estado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saveResults.map((result) => (
                        <tr key={result.variantId}>
                          <td>{result.handle}</td>
                          <td>{result.success ? "OK" : "Error"}</td>
                          <td>{result.errors.join("; ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </s-box>
              </div>
            </CatalogSectionBlock>
          </s-section>
        )}
      </CatalogPage>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return {
    ...boundary.headers(headersArgs),
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
};

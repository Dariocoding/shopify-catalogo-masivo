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
  addVariantEditorOption,
  applyVariantEditorChanges,
  createVariantEditorVariants,
  deleteVariantEditorVariants,
  fetchVariantEditorPage,
  renameVariantEditorOptions,
  VARIANT_EDITOR_PAGE_SIZE,
  type VariantEditorAddOptionRequest,
  type VariantEditorAddOptionResult,
  type VariantEditorChange,
  type VariantEditorCreateInput,
  type VariantEditorCreateRequest,
  type VariantEditorCreateResult,
  type VariantEditorDeleteRequest,
  type VariantEditorDeleteResult,
  type VariantEditorProduct,
  type VariantEditorRenameOptionChange,
  type VariantEditorRenameOptionsRequest,
  type VariantEditorRenameOptionsResult,
  type VariantEditorSaveResult,
  type VariantEditorVariant,
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

type DeleteActionData = {
  intent: "delete";
  results: VariantEditorDeleteResult[];
};

type CreateActionData = {
  intent: "create";
  result: VariantEditorCreateResult;
};

type AddOptionActionData = {
  intent: "add-option";
  result: VariantEditorAddOptionResult;
};

type RenameOptionsActionData = {
  intent: "rename-options";
  result: VariantEditorRenameOptionsResult;
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

  if (intent === "delete") {
    const deletionsJson = String(formData.get("deletions") ?? "[]");

    let deletions: VariantEditorDeleteRequest[] = [];
    try {
      deletions = JSON.parse(deletionsJson) as VariantEditorDeleteRequest[];
    } catch {
      return Response.json({ error: "Datos de eliminación inválidos." }, { status: 400 });
    }

    if (deletions.length === 0) {
      return Response.json({ error: "No hay variantes para eliminar." }, { status: 400 });
    }

    const results = await deleteVariantEditorVariants(admin.graphql, deletions);
    return Response.json({ intent: "delete", results } satisfies DeleteActionData);
  }

  if (intent === "create") {
    const createJson = String(formData.get("create") ?? "{}");

    let createRequest: VariantEditorCreateRequest;
    try {
      createRequest = JSON.parse(createJson) as VariantEditorCreateRequest;
    } catch {
      return Response.json({ error: "Datos de creación inválidos." }, { status: 400 });
    }

    const result = await createVariantEditorVariants(admin.graphql, createRequest);
    return Response.json({ intent: "create", result } satisfies CreateActionData);
  }

  if (intent === "add-option") {
    const addOptionJson = String(formData.get("addOption") ?? "{}");

    let addOptionRequest: VariantEditorAddOptionRequest;
    try {
      addOptionRequest = JSON.parse(addOptionJson) as VariantEditorAddOptionRequest;
    } catch {
      return Response.json({ error: "Datos de opción inválidos." }, { status: 400 });
    }

    const result = await addVariantEditorOption(admin.graphql, addOptionRequest);
    return Response.json({ intent: "add-option", result } satisfies AddOptionActionData);
  }

  if (intent === "rename-options") {
    const renameJson = String(formData.get("renameOptions") ?? "{}");

    let renameRequest: VariantEditorRenameOptionsRequest;
    try {
      renameRequest = JSON.parse(renameJson) as VariantEditorRenameOptionsRequest;
    } catch {
      return Response.json({ error: "Datos de renombrado inválidos." }, { status: 400 });
    }

    const result = await renameVariantEditorOptions(admin.graphql, renameRequest);
    return Response.json({ intent: "rename-options", result } satisfies RenameOptionsActionData);
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
  const [deleteResults, setDeleteResults] = useState<VariantEditorDeleteResult[]>([]);
  const [createResult, setCreateResult] = useState<VariantEditorCreateResult | null>(
    null,
  );
  const [addOptionResult, setAddOptionResult] =
    useState<VariantEditorAddOptionResult | null>(null);
  const [renameOptionsResult, setRenameOptionsResult] =
    useState<VariantEditorRenameOptionsResult | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [renamingProductId, setRenamingProductId] = useState<string | null>(null);

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
    setDeleteResults([]);
    setCreateResult(null);
    setAddOptionResult(null);
    setRenameOptionsResult(null);
    setAddingProductId(null);
    setRenamingProductId(null);
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
    const data = fetcher.data as
      | SaveActionData
      | DeleteActionData
      | CreateActionData
      | AddOptionActionData
      | RenameOptionsActionData
      | { error?: string };
    if ("error" in data && data.error) {
      shopify.toast.show(data.error, { isError: true });
      return;
    }
    if ("intent" in data && data.intent === "save") {
      setSaveResults(data.results);
      setDeleteResults([]);
      setCreateResult(null);
      setAddOptionResult(null);
      setRenameOptionsResult(null);
      setAddingProductId(null);
      setRenamingProductId(null);
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
      return;
    }

    if ("intent" in data && data.intent === "delete") {
      setDeleteResults(data.results);
      setSaveResults([]);
      setCreateResult(null);
      setAddOptionResult(null);
      setRenameOptionsResult(null);
      setAddingProductId(null);
      setRenamingProductId(null);
      const failed = data.results.filter((result) => !result.success).length;
      const ok = data.results.filter((result) => result.success).length;
      shopify.toast.show(
        failed > 0
          ? `Eliminación: ${ok} correctas, ${failed} con error`
          : ok === 1
            ? "Variante eliminada"
            : `${ok} variantes eliminadas`,
        failed > 0 ? { isError: true } : undefined,
      );

      if (ok > 0) {
        const deletedIds = new Set(
          data.results.filter((result) => result.success).map((result) => result.variantId),
        );

        setProducts((current) =>
          current
            .map((product) => ({
              ...product,
              variants: product.variants.filter(
                (variant) => !deletedIds.has(variant.id),
              ),
            }))
            .filter((product) => product.variants.length > 0),
        );

        setOriginals((current) => {
          const next = { ...current };
          for (const variantId of deletedIds) {
            delete next[variantId];
          }
          return next;
        });

        setDrafts((current) => {
          const next = { ...current };
          for (const variantId of deletedIds) {
            delete next[variantId];
          }
          return next;
        });
      }
      return;
    }

    if ("intent" in data && data.intent === "create") {
      setCreateResult(data.result);
      setSaveResults([]);
      setDeleteResults([]);
      setAddOptionResult(null);
      setRenameOptionsResult(null);
      setAddingProductId(null);
      setRenamingProductId(null);

      if (data.result.success) {
        shopify.toast.show(
          data.result.variants.length === 1
            ? "Variante creada"
            : `${data.result.variants.length} variantes creadas`,
        );

        setProducts((current) =>
          current.map((product) => {
            if (product.id !== data.result.productId) return product;

            if (product.hasOnlyDefaultVariant || product.variants.length === 0) {
              return {
                ...product,
                options: data.result.options,
                hasOnlyDefaultVariant: data.result.hasOnlyDefaultVariant,
                variants: data.result.variants,
              };
            }

            const existingIds = new Set(product.variants.map((variant) => variant.id));
            const newVariants = data.result.variants.filter(
              (variant) => !existingIds.has(variant.id),
            );

            return {
              ...product,
              options: data.result.options,
              hasOnlyDefaultVariant: data.result.hasOnlyDefaultVariant,
              variants: [...product.variants, ...newVariants],
            };
          }),
        );

        setOriginals((current) => {
          const next = { ...current };
          const product = products.find((item) => item.id === data.result.productId);
          if (product?.hasOnlyDefaultVariant || product?.variants.length === 0) {
            for (const variant of product?.variants ?? []) {
              delete next[variant.id];
            }
          }
          for (const variant of data.result.variants) {
            next[variant.id] = {
              ...variantToDraft(variant),
              handle: data.result.handle,
              inventoryItemId: variant.inventoryItemId,
            };
          }
          return next;
        });

        setDrafts((current) => {
          const next = { ...current };
          const product = products.find((item) => item.id === data.result.productId);
          if (product?.hasOnlyDefaultVariant || product?.variants.length === 0) {
            for (const variant of product?.variants ?? []) {
              delete next[variant.id];
            }
          }
          for (const variant of data.result.variants) {
            next[variant.id] = variantToDraft(variant);
          }
          return next;
        });

        setExpanded((current) => ({
          ...current,
          [data.result.productId]: true,
        }));
      } else {
        shopify.toast.show(data.result.errors.join("; ") || "Error al crear variantes", {
          isError: true,
        });
      }
      return;
    }

    if ("intent" in data && data.intent === "add-option") {
      setAddOptionResult(data.result);
      setSaveResults([]);
      setDeleteResults([]);
      setCreateResult(null);
      setRenameOptionsResult(null);
      setAddingProductId(null);
      setRenamingProductId(null);

      if (data.result.success) {
        shopify.toast.show(
          data.result.variants.length === 1
            ? "Opción agregada · 1 variante"
            : `Opción agregada · ${data.result.variants.length} variantes generadas`,
        );

        setProducts((current) =>
          current.map((product) => {
            if (product.id !== data.result.productId) return product;

            return {
              ...product,
              options: data.result.options,
              hasOnlyDefaultVariant: data.result.hasOnlyDefaultVariant,
              variants: data.result.variants,
            };
          }),
        );

        setOriginals((current) => {
          const next = { ...current };
          const product = products.find((item) => item.id === data.result.productId);
          for (const variant of product?.variants ?? []) {
            delete next[variant.id];
          }
          for (const variant of data.result.variants) {
            next[variant.id] = {
              ...variantToDraft(variant),
              handle: data.result.handle,
              inventoryItemId: variant.inventoryItemId,
            };
          }
          return next;
        });

        setDrafts((current) => {
          const next = { ...current };
          const product = products.find((item) => item.id === data.result.productId);
          for (const variant of product?.variants ?? []) {
            delete next[variant.id];
          }
          for (const variant of data.result.variants) {
            next[variant.id] = variantToDraft(variant);
          }
          return next;
        });

        setExpanded((current) => ({
          ...current,
          [data.result.productId]: true,
        }));
      } else {
        shopify.toast.show(data.result.errors.join("; ") || "Error al agregar opción", {
          isError: true,
        });
      }
      return;
    }

    if ("intent" in data && data.intent === "rename-options") {
      setRenameOptionsResult(data.result);
      setSaveResults([]);
      setDeleteResults([]);
      setCreateResult(null);
      setAddOptionResult(null);
      setAddingProductId(null);
      setRenamingProductId(null);

      if (data.result.success) {
        shopify.toast.show("Opciones y valores actualizados");

        setProducts((current) =>
          current.map((product) => {
            if (product.id !== data.result.productId) return product;

            const draftsById = new Map(
              product.variants.map((variant) => [variant.id, drafts[variant.id]]),
            );

            return {
              ...product,
              options: data.result.options,
              variants: data.result.variants.map((variant) => {
                const draft = draftsById.get(variant.id);
                if (!draft) return variant;

                return {
                  ...variant,
                  sku: draft.sku,
                  price: draft.price,
                  compareAtPrice: draft.compareAtPrice,
                  stock: draft.stock,
                  barcode: draft.barcode,
                };
              }),
            };
          }),
        );

        setOriginals((current) => {
          const next = { ...current };
          for (const variant of data.result.variants) {
            const existing = next[variant.id];
            next[variant.id] = {
              ...variantToDraft(variant),
              handle: data.result.handle,
              inventoryItemId: variant.inventoryItemId,
              ...(existing
                ? {
                    sku: existing.sku,
                    price: existing.price,
                    compareAtPrice: existing.compareAtPrice,
                    stock: existing.stock,
                    barcode: existing.barcode,
                  }
                : {}),
            };
          }
          return next;
        });
      } else {
        shopify.toast.show(
          data.result.errors.join("; ") || "Error al renombrar opciones",
          { isError: true },
        );
      }
    }
  }, [fetcher.state, fetcher.data, shopify, drafts, products]);

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

  const deleteVariant = (productId: string, variant: VariantEditorVariant) => {
    const product = products.find((item) => item.id === productId);
    if (!product || product.variants.length <= 1) {
      shopify.toast.show(
        "No se puede eliminar la única variante del producto.",
        { isError: true },
      );
      return;
    }

    const confirmed = window.confirm(
      `¿Eliminar la variante "${variant.label}" del producto "${product.title}"?\n\nEsta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.set("intent", "delete");
    formData.set(
      "deletions",
      JSON.stringify([
        {
          productId,
          variantId: variant.id,
          handle: product.handle,
        } satisfies VariantEditorDeleteRequest,
      ]),
    );
    setSaveResults([]);
    setDeleteResults([]);
    fetcher.submit(formData, { method: "post" });
  };

  const createVariants = (
    productId: string,
    variants: VariantEditorCreateInput[],
  ) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      shopify.toast.show("Producto no encontrado.", { isError: true });
      return;
    }

    setAddingProductId(productId);
    setSaveResults([]);
    setDeleteResults([]);
    setCreateResult(null);
    setAddOptionResult(null);
    setRenameOptionsResult(null);
    setRenamingProductId(null);

    const formData = new FormData();
    formData.set("intent", "create");
    formData.set(
      "create",
      JSON.stringify({
        productId,
        handle: product.handle,
        hasOnlyDefaultVariant: product.hasOnlyDefaultVariant,
        variants,
      } satisfies VariantEditorCreateRequest),
    );
    fetcher.submit(formData, { method: "post" });
  };

  const addOption = (productId: string, optionName: string, values: string[]) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      shopify.toast.show("Producto no encontrado.", { isError: true });
      return;
    }

    setAddingProductId(productId);
    setSaveResults([]);
    setDeleteResults([]);
    setCreateResult(null);
    setAddOptionResult(null);
    setRenameOptionsResult(null);
    setRenamingProductId(null);

    const formData = new FormData();
    formData.set("intent", "add-option");
    formData.set(
      "addOption",
      JSON.stringify({
        productId,
        handle: product.handle,
        optionName,
        values,
      } satisfies VariantEditorAddOptionRequest),
    );
    fetcher.submit(formData, { method: "post" });
  };

  const renameOptions = (
    productId: string,
    changes: VariantEditorRenameOptionChange[],
  ) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      shopify.toast.show("Producto no encontrado.", { isError: true });
      return;
    }

    setRenamingProductId(productId);
    setSaveResults([]);
    setDeleteResults([]);
    setCreateResult(null);
    setAddOptionResult(null);
    setRenameOptionsResult(null);
    setAddingProductId(null);

    const formData = new FormData();
    formData.set("intent", "rename-options");
    formData.set(
      "renameOptions",
      JSON.stringify({
        productId,
        handle: product.handle,
        changes,
      } satisfies VariantEditorRenameOptionsRequest),
    );
    fetcher.submit(formData, { method: "post" });
  };

  const loadedCount = products.length;
  const totalCount = loaderData.totalCount || loadedCount;

  return (
    <s-page heading="Variantes">
      <Link to="/app" style={{ textDecoration: "none" }}>
        <s-button slot="primary-action">Volver al inicio</s-button>
      </Link>

      <CatalogPage className={dirtyVariantIds.size > 0 ? "catalog-page--has-sticky-bar" : undefined}>
        <CatalogHero
          title="Editor de variantes"
          description="Edita, crea y elimina variantes con fotos y tablas. Agrega tallas o colores sin usar Excel."
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

        {addingProductId && fetcher.state !== "idle" && (
          <CatalogProgress
            label="Creando variantes y opciones en Shopify…"
            percent={60}
          />
        )}

        {renamingProductId && fetcher.state !== "idle" && (
          <CatalogProgress
            label="Renombrando opciones en Shopify…"
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
          onDeleteVariant={deleteVariant}
          onCreateVariants={createVariants}
          onAddOption={addOption}
          onRenameOptions={renameOptions}
          addingProductId={addingProductId}
          renamingProductId={renamingProductId}
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

        {(saveResults.length > 0 ||
          deleteResults.length > 0 ||
          (createResult && !createResult.success) ||
          (addOptionResult && !addOptionResult.success) ||
          (renameOptionsResult && !renameOptionsResult.success)) && (
          <s-section heading="Resultado de la operación">
            <CatalogSectionBlock>
              <CatalogBodyText>
                {createResult && !createResult.success
                  ? createResult.errors.join("; ") || "Error al crear variantes."
                  : addOptionResult && !addOptionResult.success
                    ? addOptionResult.errors.join("; ") || "Error al agregar opción."
                    : renameOptionsResult && !renameOptionsResult.success
                      ? renameOptionsResult.errors.join("; ") ||
                        "Error al renombrar opciones."
                      : `${(saveResults.length > 0 ? saveResults : deleteResults).filter(
                          (result) => result.success,
                        ).length} correctos, ${(saveResults.length > 0
                          ? saveResults
                          : deleteResults
                        ).filter((result) => !result.success).length} con error.`}
              </CatalogBodyText>
              {saveResults.length > 0 || deleteResults.length > 0 ? (
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
                        {(saveResults.length > 0 ? saveResults : deleteResults).map(
                          (result) => (
                            <tr key={result.variantId}>
                              <td>{result.handle}</td>
                              <td>{result.success ? "OK" : "Error"}</td>
                              <td>{result.errors.join("; ") || "—"}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </s-box>
                </div>
              ) : null}
            </CatalogSectionBlock>
          </s-section>
        )}
      </CatalogPage>

      {dirtyVariantIds.size > 0 && (
        <div
          className="variant-editor__sticky-bar"
          role="region"
          aria-label="Cambios sin guardar"
        >
          <span className="variant-editor__sticky-bar-text">
            {dirtyVariantIds.size} cambio
            {dirtyVariantIds.size === 1 ? "" : "s"} sin guardar
          </span>
          <s-button
            variant="primary"
            onClick={saveChanges}
            {...(isSaving ? { loading: true } : {})}
          >
            Guardar cambios
          </s-button>
        </div>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return {
    ...boundary.headers(headersArgs),
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
};

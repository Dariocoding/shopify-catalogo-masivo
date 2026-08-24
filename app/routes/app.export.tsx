import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useLoaderData } from "react-router";

import { CatalogFiltersPanel } from "../components/catalog-filters";
import {
  CatalogBodyText,
  CatalogField,
  CatalogHero,
  CatalogInput,
  CatalogPage,
  CatalogProgress,
  CatalogStep,
  CatalogStepActions,
  CatalogSteps,
} from "../components/catalog-ui";
import {
  authenticatedAppFetch,
  isExcelResponse,
  readFetchError,
} from "../lib/authenticated-fetch.client";
import {
  describeExportFilters,
  EMPTY_EXPORT_FILTERS,
  parseExportFilters,
  type ExportFilters,
} from "../lib/catalog-export-filters";
import {
  listExportHistory,
  recordExportHistory,
} from "../lib/catalog-export-history.server";
import {
  getCollectionOptions,
  getExportSummary,
} from "../lib/catalog-export.server";
import { fetchCatalogProductMetafieldDefinitions } from "../lib/catalog-metafields.server";
import { sanitizeExportFilename } from "../lib/catalog-schema";
import { downloadBlob } from "../lib/download-blob.client";
import { authenticate } from "../shopify.server";

const EXPORT_API_PATH = "/api/catalog-export";

function formatHistoryDate(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [collections, history] = await Promise.all([
    getCollectionOptions(admin.graphql),
    listExportHistory(session.shop),
  ]);
  const [summary, metafieldDefinitions] = await Promise.all([
    getExportSummary(admin.graphql),
    fetchCatalogProductMetafieldDefinitions(admin.graphql),
  ]);

  const collectionTitles = Object.fromEntries(
    collections.map((collection) => [collection.id, collection.title]),
  );

  return {
    productCount: summary.productCount,
    defaultFilename: sanitizeExportFilename(""),
    collections,
    collectionTitles,
    history,
    metafieldColumns: metafieldDefinitions.map((definition) => ({
      name: definition.name,
      header: `metafield.${definition.namespace}.${definition.key}`,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "batch");

    if (intent === "record") {
      const filters = parseExportFilters(String(formData.get("filters") ?? ""));
      const collections = await getCollectionOptions(admin.graphql);
      const collectionTitles = Object.fromEntries(
        collections.map((collection) => [collection.id, collection.title]),
      );

      await recordExportHistory(session.shop, {
        filename: sanitizeExportFilename(
          String(formData.get("filename") ?? ""),
        ),
        productCount: Number(formData.get("productCount") ?? "0"),
        filters,
        collectionTitles,
      });

      const history = await listExportHistory(session.shop);
      return Response.json({ intent: "record", history });
    }

    if (intent === "history") {
      const history = await listExportHistory(session.shop);
      return Response.json({ intent: "history", history });
    }

    return Response.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) throw error;
    const message =
      error instanceof Error ? error.message : "Error al exportar el catálogo.";
    return Response.json({ error: message }, { status: 500 });
  }
};

export default function ExportPage() {
  const loaderData = useLoaderData<typeof loader>();
  const {
    productCount = 0,
    defaultFilename = sanitizeExportFilename(""),
    collections = [],
    collectionTitles = {},
    history: initialHistory = [],
    metafieldColumns = [],
  } = loaderData;

  const shopify = useAppBridge();
  const [filename, setFilename] = useState(defaultFilename);
  const [filters, setFilters] = useState<ExportFilters>({
    ...EMPTY_EXPORT_FILTERS,
  });
  const [history, setHistory] = useState(initialHistory);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ exported: 0, total: 0 });

  const filtersLabel = useMemo(
    () => describeExportFilters(filters, collectionTitles),
    [filters, collectionTitles],
  );

  const hasActiveFilters =
    Boolean(filters.collectionId) ||
    Boolean(filters.vendor) ||
    Boolean(filters.status) ||
    Boolean(filters.tag);

  const progressPercent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.exported / progress.total) * 100))
      : 0;

  const updateFilter = <K extends keyof ExportFilters>(
    key: K,
    value: ExportFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const refreshHistory = useCallback(async () => {
    const formData = new FormData();
    formData.set("intent", "history");

    const response = await authenticatedAppFetch(
      shopify,
      window.location.pathname,
      { method: "POST", body: formData },
    );

    if (!response.ok) return;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return;

    const data = (await response.json()) as {
      intent?: string;
      history?: typeof history;
    };

    if (data.intent === "history" && data.history) {
      setHistory(data.history);
    }
  }, [shopify]);

  const startDownload = async () => {
    if (exporting) return;

    const finalFilename = sanitizeExportFilename(filename);
    setExporting(true);
    setProgress({ exported: 0, total: productCount });

    try {
      const formData = new FormData();
      formData.set("filters", JSON.stringify(filters));
      formData.set("filename", finalFilename);

      const response = await authenticatedAppFetch(shopify, EXPORT_API_PATH, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readFetchError(response));
      }

      if (!isExcelResponse(response)) {
        throw new Error(await readFetchError(response));
      }

      const blob = await response.blob();
      downloadBlob(blob, finalFilename);

      await refreshHistory();

      const count = response.headers.get("X-Export-Count");
      const variantCount = response.headers.get("X-Export-Variant-Count");
      shopify.toast.show(
        count
          ? variantCount && variantCount !== count
            ? `Excel descargado (${count} productos, ${variantCount} variantes). Revisa Descargas.`
            : `Excel descargado (${count} productos). Revisa Descargas.`
          : `Excel descargado. Revisa tu carpeta de Descargas.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error al exportar. Inténtalo de nuevo.";
      shopify.toast.show(message, { isError: true });
    } finally {
      setExporting(false);
      setProgress({ exported: 0, total: 0 });
    }
  };

  useEffect(() => {
    setHistory(initialHistory);
  }, [initialHistory]);

  return (
    <s-page heading="Exportar catálogo">
      <Link to="/app" style={{ textDecoration: "none" }}>
        <s-button slot="primary-action">Volver al inicio</s-button>
      </Link>

      <CatalogPage>
        <CatalogHero
          title="Exportar catálogo"
          stat={`${productCount.toLocaleString("es")} productos`}
        />

        <s-box padding="base" background="subdued" borderRadius="base">
          <CatalogBodyText>
            ¿Quieres editar productos sin variantes ni IDs técnicos? Usa{" "}
            <Link to="/app/bulk-edit">Edición masiva</Link> — una fila por
            producto, más fácil para el día a día.
          </CatalogBodyText>
        </s-box>

        <CatalogSteps>
          <CatalogStep step={1} title="Filtrar y descargar (modo avanzado)">
            <CatalogFiltersPanel
              filters={filters}
              collections={collections}
              filtersLabel={filtersLabel}
              hasActiveFilters={hasActiveFilters}
              disabled={exporting}
              onFilterChange={updateFilter}
              onClear={() => setFilters({ ...EMPTY_EXPORT_FILTERS })}
            />

            <CatalogField label="Nombre del archivo">
              <CatalogInput
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={exporting}
                autoComplete="off"
              />
            </CatalogField>

            {metafieldColumns.length > 0 && (
              <CatalogBodyText>
                Este Excel también incluye el metafield{" "}
                <strong>{metafieldColumns[0]?.name}</strong> (columna{" "}
                <code>{metafieldColumns[0]?.header}</code>).
              </CatalogBodyText>
            )}

            <CatalogBodyText>
              Modo avanzado: una fila por <strong>variante</strong> (talla,
              color, etc.). Incluye <code>variant_id</code> y{" "}
              <code>variant_options</code> para identificar cada variante.
              Usa esta opción solo si necesitas editar variantes por separado.
            </CatalogBodyText>
            {exporting && (
              <CatalogProgress
                label={`Generando Excel con ${productCount.toLocaleString("es")} productos…`}
                percent={progressPercent || 50}
              />
            )}

            <div className="catalog-actions">
              <s-button
                variant="primary"
                onClick={startDownload}
                {...(exporting ? { loading: true } : {})}
              >
                Descargar Excel
              </s-button>
            </div>
          </CatalogStep>

          <CatalogStep step={2} title="Importar">
            <CatalogStepActions>
              <Link to="/app/import" style={{ textDecoration: "none" }}>
                <s-button variant="primary">Importar catálogo</s-button>
              </Link>
            </CatalogStepActions>
          </CatalogStep>
        </CatalogSteps>

        {history.length > 0 && (
          <s-section heading="Historial">
            <div className="catalog-history catalog-panel">
              {history.map((entry) => (
                <div key={entry.id} className="catalog-history__item">
                  <div className="catalog-history__name">{entry.filename}</div>
                  <div className="catalog-history__meta">
                    {entry.productCount.toLocaleString("es")} productos ·{" "}
                    {formatHistoryDate(entry.createdAt)} · {entry.filtersLabel}
                  </div>
                </div>
              ))}
            </div>
          </s-section>
        )}

      </CatalogPage>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

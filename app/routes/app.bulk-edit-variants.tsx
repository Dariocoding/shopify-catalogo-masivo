import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useActionData, useFetcher, useLoaderData } from "react-router";

import { CatalogFiltersPanel } from "../components/catalog-filters";
import {
  CatalogBodyText,
  CatalogField,
  CatalogHero,
  CatalogInput,
  CatalogPage,
  CatalogProgress,
  CatalogSectionBlock,
  CatalogStack,
  CatalogStep,
  CatalogStepActions,
  CatalogSteps,
  CatalogUpload,
} from "../components/catalog-ui";
import {
  authenticatedAppFetch,
  isExcelResponse,
  readFetchError,
} from "../lib/authenticated-fetch.client";
import {
  describeExportFilters,
  EMPTY_EXPORT_FILTERS,
  type ExportFilters,
} from "../lib/catalog-export-filters";
import {
  importCatalogBatch,
  type ImportRowResult,
} from "../lib/catalog-import.server";
import {
  fetchCatalogProductMetafieldDefinitions,
  metafieldHeadersFromDefinitions,
} from "../lib/catalog-metafields.server";
import {
  getVariantExportSummary,
  getCollectionOptions,
} from "../lib/catalog-export.server";
import {
  IMPORT_BATCH_SIZE,
  parseCatalogCsv,
  sanitizeExportFilename,
  type ParsedCatalog,
} from "../lib/catalog-schema";
import { downloadBlob } from "../lib/download-blob.client";
import { spreadsheetFileToCsvText } from "../lib/parse-spreadsheet.client";
import { authenticate } from "../shopify.server";

const VARIANT_EXPORT_API_PATH = "/api/catalog-variant-export";

type PreviewData = {
  intent: "preview";
  parsed: ParsedCatalog;
  csvText: string;
};

type ImportData = {
  intent: "import";
  results: ImportRowResult[];
  nextOffset: number;
  totalRows: number;
  done: boolean;
  csvText: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [collections, summary, metafieldDefinitions] = await Promise.all([
    getCollectionOptions(admin.graphql),
    getVariantExportSummary(admin.graphql),
    fetchCatalogProductMetafieldDefinitions(admin.graphql),
  ]);

  return {
    productCount: summary.productCount,
    defaultFilename: sanitizeExportFilename("", "variantes"),
    collections,
    batchSize: IMPORT_BATCH_SIZE,
    metafieldColumns: metafieldDefinitions.map((definition) => ({
      name: definition.name,
      header: `metafield.${definition.namespace}.${definition.key}`,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const csvText = String(formData.get("csv") ?? "");

  if (intent === "preview" || intent === "import") {
    if (!csvText.trim()) {
      return { error: "Sube un archivo Excel con contenido." };
    }

    const catalogMetafieldDefinitions =
      await fetchCatalogProductMetafieldDefinitions(admin.graphql);
    const allowedMetafieldHeaders = new Set(
      metafieldHeadersFromDefinitions(catalogMetafieldDefinitions),
    );
    const parsed = parseCatalogCsv(csvText, allowedMetafieldHeaders);

    if (intent === "preview") {
      return {
        intent: "preview",
        parsed,
        csvText,
      } satisfies PreviewData;
    }

    const offset = Number(formData.get("offset") ?? "0");
    const batch = await importCatalogBatch(
      admin.graphql,
      parsed,
      offset,
      IMPORT_BATCH_SIZE,
    );
    const nextOffset = offset + IMPORT_BATCH_SIZE;
    const done = nextOffset >= parsed.rows.length;

    return {
      intent: "import",
      results: batch.results,
      nextOffset,
      totalRows: parsed.rows.length,
      done,
      csvText,
    } satisfies ImportData;
  }

  return { error: "Acción no reconocida." };
};

export default function BulkEditVariantsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const {
    productCount = 0,
    defaultFilename = sanitizeExportFilename("", "variantes"),
    collections = [],
    metafieldColumns = [],
  } = loaderData;

  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [filename, setFilename] = useState(defaultFilename);
  const [filters, setFilters] = useState<ExportFilters>({
    ...EMPTY_EXPORT_FILTERS,
  });
  const [exporting, setExporting] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [importActive, setImportActive] = useState(false);
  const [accumulatedResults, setAccumulatedResults] = useState<
    ImportRowResult[]
  >([]);
  const [importProgress, setImportProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const lastHandledImportKey = useRef<string | null>(null);

  const collectionTitles = useMemo(
    () => Object.fromEntries(collections.map((c) => [c.id, c.title])),
    [collections],
  );

  const filtersLabel = useMemo(
    () =>
      describeExportFilters(filters, collectionTitles, {
        onlyMultiVariant: true,
      }),
    [filters, collectionTitles],
  );

  const hasActiveFilters =
    Boolean(filters.collectionId) ||
    Boolean(filters.vendor) ||
    Boolean(filters.status) ||
    Boolean(filters.tag);

  const data = fetcher.data ?? actionData;
  const isBusy =
    fetcher.state !== "idle" || readingFile || importActive || exporting;

  const preview =
    data && "intent" in data && data.intent === "preview" ? data : null;
  const importRun =
    data && "intent" in data && data.intent === "import" ? data : null;
  const showImportResults =
    importActive || accumulatedResults.length > 0 || importRun;

  const updateFilter = <K extends keyof ExportFilters>(
    key: K,
    value: ExportFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const startDownload = async () => {
    if (exporting) return;

    const finalFilename = sanitizeExportFilename(filename, "variantes");
    setExporting(true);

    try {
      const formData = new FormData();
      formData.set("filters", JSON.stringify(filters));
      formData.set("filename", finalFilename);

      const response = await authenticatedAppFetch(
        shopify,
        VARIANT_EXPORT_API_PATH,
        { method: "POST", body: formData },
      );

      if (!response.ok) {
        throw new Error(await readFetchError(response));
      }

      if (!isExcelResponse(response)) {
        throw new Error(await readFetchError(response));
      }

      const blob = await response.blob();
      downloadBlob(blob, finalFilename);

      const productCountHeader = response.headers.get("X-Export-Count");
      const variantCountHeader = response.headers.get("X-Export-Variant-Count");
      shopify.toast.show(
        productCountHeader && variantCountHeader
          ? `Excel descargado (${variantCountHeader} variantes de ${productCountHeader} productos).`
          : "Excel descargado. Revisa tu carpeta de Descargas.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error al exportar. Inténtalo de nuevo.";
      shopify.toast.show(message, { isError: true });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (data && "csvText" in data && data.csvText) {
      setCsvText(data.csvText);
    }
  }, [data]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !importActive) return;

    const importData =
      fetcher.data &&
      "intent" in fetcher.data &&
      fetcher.data.intent === "import"
        ? fetcher.data
        : null;
    if (!importData) return;

    const responseKey = `${importData.nextOffset}-${importData.totalRows}-${importData.results.length}`;
    if (lastHandledImportKey.current === responseKey) return;
    lastHandledImportKey.current = responseKey;

    setAccumulatedResults((prev) => {
      const combined = [...prev, ...importData.results];
      setImportProgress({
        processed: Math.min(importData.nextOffset, importData.totalRows),
        total: importData.totalRows,
      });

      if (importData.done) {
        const failed = combined.filter((r) => !r.success).length;
        const ok = combined.filter((r) => r.success).length;
        shopify.toast.show(
          `Importación terminada: ${ok} correctos, ${failed} con error`,
        );
        setImportActive(false);
      }

      return combined;
    });

    if (!importData.done) {
      fetcher.submit(
        {
          intent: "import",
          csv: importData.csvText,
          offset: String(importData.nextOffset),
        },
        { method: "post" },
      );
    }
  }, [fetcher.state, fetcher.data, shopify, importActive]);

  const onFileSelected = async (file: File | null) => {
    if (!file) return;

    setReadingFile(true);
    setFileName(file.name);
    setAccumulatedResults([]);
    setImportProgress(null);
    setImportActive(false);

    try {
      const text = await spreadsheetFileToCsvText(file);
      setCsvText(text);
      fetcher.submit({ intent: "preview", csv: text }, { method: "post" });
    } catch {
      shopify.toast.show("No se pudo leer el archivo.", { isError: true });
      setFileName("");
    } finally {
      setReadingFile(false);
    }
  };

  const runImport = () => {
    lastHandledImportKey.current = null;
    setAccumulatedResults([]);
    setImportProgress(null);
    setImportActive(true);
    fetcher.submit(
      { intent: "import", csv: csvText, offset: "0" },
      { method: "post" },
    );
  };

  return (
    <s-page heading="Edición masiva de variantes">
      <Link to="/app" style={{ textDecoration: "none" }}>
        <s-button slot="primary-action">Volver al inicio</s-button>
      </Link>

      <CatalogPage>
        <CatalogHero
          title="Edición masiva de variantes"
          description="Solo productos con variantes (tallas, colores, etc.). Una fila por variante en el Excel."
          stat={`${productCount.toLocaleString("es")} productos`}
        />

        <CatalogBodyText>
          Los productos sin variantes no se incluyen aquí. Para editarlos usa la{" "}
          <Link to="/app/bulk-edit">edición masiva simple</Link>.
        </CatalogBodyText>

        <CatalogSteps>
          <CatalogStep step={1} title="Descargar Excel">
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

            <CatalogBodyText>
              Columnas: <code>handle</code>, <code>title</code>,{" "}
              <code>variant_id</code>, <code>variant_options</code>,{" "}
              <code>sku</code>, <code>stock</code>, <code>price</code>,{" "}
              <code>product_type</code>, <code>tags</code>
              {metafieldColumns.length > 0 && (
                <>
                  {" "}
                  y metafield{" "}
                  <code>{metafieldColumns[0]?.header}</code>
                </>
              )}
              .
            </CatalogBodyText>

            {exporting && (
              <CatalogProgress
                label={`Generando Excel con ${productCount.toLocaleString("es")} productos…`}
                percent={50}
              />
            )}

            <CatalogStepActions>
              <s-button
                variant="primary"
                onClick={startDownload}
                {...(exporting ? { loading: true } : {})}
              >
                Descargar Excel
              </s-button>
            </CatalogStepActions>
          </CatalogStep>

          <CatalogStep step={2} title="Editar y subir">
            <CatalogStack>
              <CatalogBodyText>
                Edita el Excel en tu computadora (precio, stock, SKU, etc.) y
                súbelo aquí. Cada fila es una variante — usa{" "}
                <code>variant_id</code> o <code>sku</code> para identificarla.
                No modifiques <code>variant_options</code> (talla/color).
              </CatalogBodyText>

              <CatalogUpload
                label="Archivo Excel editado"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                disabled={isBusy}
                fileName={fileName}
                onFile={onFileSelected}
              />
            </CatalogStack>
          </CatalogStep>

          {preview && (
            <CatalogStep step={3} title="Revisar y aplicar">
              <CatalogSectionBlock>
                <CatalogBodyText>
                  {preview.parsed.rows.length} variante
                  {preview.parsed.rows.length === 1 ? "" : "s"} lista
                  {preview.parsed.rows.length === 1 ? "" : "s"} para importar.
                </CatalogBodyText>

                {preview.parsed.errors.length > 0 && (
                  <s-box padding="base" background="subdued" borderRadius="base">
                    <s-heading>Revisa estos puntos</s-heading>
                    <ul>
                      {preview.parsed.errors.map((err, i) => (
                        <li key={i}>
                          Fila {err.row}
                          {err.field ? ` (${err.field})` : ""}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </s-box>
                )}

                {preview.parsed.rows.length > 0 &&
                  preview.parsed.errors.length === 0 && (
                    <CatalogStepActions>
                      <s-button
                        variant="primary"
                        onClick={runImport}
                        {...(isBusy ? { loading: true } : {})}
                      >
                        Aplicar cambios
                      </s-button>
                    </CatalogStepActions>
                  )}
              </CatalogSectionBlock>
            </CatalogStep>
          )}
        </CatalogSteps>

        {data && "error" in data && data.error && (
          <s-section heading="Error">
            <CatalogBodyText>{data.error}</CatalogBodyText>
          </s-section>
        )}

        {showImportResults && importProgress && (
          <s-section heading="Resultado">
            <CatalogSectionBlock>
              <CatalogBodyText>
                {importActive && !importRun?.done
                  ? `Importando… ${importProgress.processed} de ${importProgress.total}`
                  : `Procesados ${importProgress.processed} de ${importProgress.total}`}
              </CatalogBodyText>

              <div className="catalog-result-table">
                <s-box padding="base" background="subdued" borderRadius="base">
                  <table
                    style={{
                      width: "100%",
                      fontSize: 13,
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr>
                        <th align="left">Fila</th>
                        <th align="left">Handle</th>
                        <th align="left">Estado</th>
                        <th align="left">Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accumulatedResults.map((row) => (
                        <tr key={row.row}>
                          <td>{row.row}</td>
                          <td>{row.handle}</td>
                          <td>{row.success ? "OK" : "Error"}</td>
                          <td>{row.errors.join("; ") || "—"}</td>
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

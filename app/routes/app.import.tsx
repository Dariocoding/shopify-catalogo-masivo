import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, useActionData, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  CatalogBodyText,
  CatalogPage,
  CatalogSectionBlock,
  CatalogStack,
  CatalogStepActions,
  CatalogUpload,
} from "../components/catalog-ui";
import { authenticate } from "../shopify.server";
import { importCatalogBatch, type ImportRowResult } from "../lib/catalog-import.server";
import {
  fetchCatalogProductMetafieldDefinitions,
  metafieldHeadersFromDefinitions,
} from "../lib/catalog-metafields.server";
import {
  CATALOG_COLUMNS,
  IMPORT_BATCH_SIZE,
  parseCatalogCsv,
  rowsToCsv,
  type ParsedCatalog,
} from "../lib/catalog-schema";
import { spreadsheetFileToCsvText } from "../lib/parse-spreadsheet.client";

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

  const sampleRow = Object.fromEntries(
    CATALOG_COLUMNS.map((c) => [c.key, ""]),
  ) as Record<string, string>;
  sampleRow.handle = "ejemplo-producto";
  sampleRow.title = "Producto de ejemplo";
  sampleRow.status = "DRAFT";
  sampleRow.price = "19.99";
  sampleRow.sku = "SKU-EJEMPLO";

  const metafieldDefinitions = await fetchCatalogProductMetafieldDefinitions(
    admin.graphql,
  );

  return {
    batchSize: IMPORT_BATCH_SIZE,
    templateCsv: rowsToCsv([sampleRow as never]),
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

  if (intent === "import") {
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

export default function ImportPage() {
  const { metafieldColumns = [] } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
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

  const data = fetcher.data ?? actionData;
  const isBusy =
    fetcher.state !== "idle" || readingFile || importActive;

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

  const preview =
    data && "intent" in data && data.intent === "preview" ? data : null;
  const importRun =
    data && "intent" in data && data.intent === "import" ? data : null;
  const showImportResults =
    importActive || accumulatedResults.length > 0 || importRun;

  const runPreview = () => {
    if (!csvText.trim()) {
      shopify.toast.show("Primero sube tu archivo Excel.", { isError: true });
      return;
    }
    fetcher.submit(
      { intent: "preview", csv: csvText },
      { method: "post" },
    );
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

  const onFileSelected = async (file: File | null) => {
    if (!file) return;

    setReadingFile(true);
    setFileName(file.name);

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

  return (
    <s-page heading="Importar catálogo">
      <Link to="/app" style={{ textDecoration: "none" }}>
        <s-button slot="primary-action">Volver al inicio</s-button>
      </Link>

      <CatalogPage>
        <s-box padding="base" background="subdued" borderRadius="base">
          <CatalogBodyText>
            Para editar variantes, usa el{" "}
            <Link to="/app/variants">Editor de variantes</Link>. Para productos
            simples (sin tallas/colores), usa{" "}
            <Link to="/app/bulk-edit">Edición masiva</Link>.
          </CatalogBodyText>
        </s-box>

        <s-section heading="Importar catálogo (modo avanzado)">
          <CatalogStack>
            <CatalogBodyText>
              Esta pantalla es para Excel con <strong>variantes</strong> (una
              fila por talla/color). Usa <code>variant_id</code> del export
              avanzado para identificar cada variante.{" "}
              <code>variant_options</code> es solo informativo.
            </CatalogBodyText>

            {metafieldColumns.length > 0 && (
              <CatalogBodyText>
                Si el archivo incluye el metafield{" "}
                <strong>{metafieldColumns[0]?.name}</strong> (columna{" "}
                <code>{metafieldColumns[0]?.header}</code>), también se
                actualizará al importar.
              </CatalogBodyText>
            )}

            <CatalogUpload
              label="Archivo Excel"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              disabled={isBusy}
              fileName={fileName}
              onFile={onFileSelected}
            />

            <CatalogStepActions>
              <s-button
                variant="primary"
                onClick={runPreview}
                {...(isBusy ? { loading: true } : {})}
              >
                Revisar
              </s-button>
            </CatalogStepActions>
          </CatalogStack>
        </s-section>

        {data && "error" in data && data.error && (
          <s-section heading="Error">
            <CatalogBodyText>{data.error}</CatalogBodyText>
          </s-section>
        )}

        {preview && (
          <s-section heading="Vista previa">
            <CatalogSectionBlock>
              <CatalogBodyText>
                {preview.parsed.rows.length} producto
                {preview.parsed.rows.length === 1 ? "" : "s"} listo
                {preview.parsed.rows.length === 1 ? "" : "s"} para importar.
              </CatalogBodyText>

              {preview.parsed.metafieldColumns.length > 0 && (
                <CatalogBodyText>
                  Metafields en el archivo:{" "}
                  {preview.parsed.metafieldColumns
                    .map((column) => {
                      const label =
                        metafieldColumns.find(
                          (item) => item.header === column.header,
                        )?.name ?? column.header;
                      return label;
                    })
                    .join(", ")}
                  .
                </CatalogBodyText>
              )}

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
          </s-section>
        )}

        {showImportResults && importProgress && (
          <s-section heading="Resultado">
            <CatalogSectionBlock>
              <CatalogBodyText>
                {importActive && !importRun?.done
                  ? `Importando… ${importProgress.processed} de ${importProgress.total}`
                  : `Procesadas ${importProgress.processed} de ${importProgress.total}`}
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
  return boundary.headers(headersArgs);
};

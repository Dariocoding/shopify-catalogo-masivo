/**
 * Formato propio de catálogo (Excel).
 * Una fila = un producto con su variante principal (primera variante).
 */

/** Tamaño de página al paginar productos en Shopify Admin GraphQL (máx. 250). */
export const EXPORT_PAGE_SIZE = 250;
export const IMPORT_BATCH_SIZE = 10;

export const CATALOG_COLUMNS = [
  { key: "handle", label: "handle", required: true },
  { key: "title", label: "title", required: true },
  { key: "description_html", label: "description_html", required: false },
  { key: "vendor", label: "vendor", required: false },
  { key: "product_type", label: "product_type", required: false },
  { key: "status", label: "status", required: false },
  { key: "tags", label: "tags", required: false },
  { key: "sku", label: "sku", required: false },
  { key: "stock", label: "stock", required: false },
  { key: "price", label: "price", required: false },
  { key: "compare_at_price", label: "compare_at_price", required: false },
  { key: "barcode", label: "barcode", required: false },
] as const;

/** Columnas del Excel de exportación. maxWidth evita columnas demasiado anchas. */
export const EXPORT_CATALOG_COLUMNS = [
  { key: "handle", label: "handle", maxWidth: 26 },
  { key: "title", label: "title", maxWidth: 52 },
  { key: "vendor", label: "vendor", maxWidth: 18 },
  { key: "product_type", label: "product_type", maxWidth: 16 },
  { key: "tags", label: "tags", maxWidth: 22 },
  { key: "stock", label: "stock", maxWidth: 10 },
  { key: "price", label: "price", maxWidth: 12 },
] as const;

export type ExportCatalogColumnKey =
  (typeof EXPORT_CATALOG_COLUMNS)[number]["key"];

export type CatalogColumnKey = (typeof CATALOG_COLUMNS)[number]["key"];

export type CatalogRow = Record<CatalogColumnKey, string>;

export type RowValidationError = {
  row: number;
  field?: string;
  message: string;
};

const COLUMN_KEYS = new Set<string>(CATALOG_COLUMNS.map((c) => c.key));
const METAFIELD_PREFIX = "metafield.";

export type ParsedCatalog = {
  headers: string[];
  rows: CatalogRow[];
  metafieldColumns: { header: string; namespace: string; key: string }[];
  errors: RowValidationError[];
};

const VALID_STATUS = new Set(["ACTIVE", "DRAFT", "ARCHIVED"]);

function emptyRow(): CatalogRow {
  return Object.fromEntries(
    CATALOG_COLUMNS.map((c) => [c.key, ""]),
  ) as CatalogRow;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseMetafieldHeader(
  header: string,
): { namespace: string; key: string } | null {
  if (!header.startsWith(METAFIELD_PREFIX)) return null;
  const rest = header.slice(METAFIELD_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0 || dot === rest.length - 1) return null;
  return { namespace: rest.slice(0, dot), key: rest.slice(dot + 1) };
}

export function metafieldHeader(namespace: string, key: string): string {
  return `${METAFIELD_PREFIX}${namespace}.${key}`;
}

export function parseCatalogCsv(text: string): ParsedCatalog {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const errors: RowValidationError[] = [];

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      metafieldColumns: [],
      errors: [{ row: 0, message: "El archivo está vacío" }],
    };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const unknown = headers.filter(
    (h) => !COLUMN_KEYS.has(h) && !parseMetafieldHeader(h),
  );
  if (unknown.length > 0) {
    errors.push({
      row: 1,
      message: `Columnas desconocidas: ${unknown.join(", ")}`,
    });
  }

  const missingRequired = CATALOG_COLUMNS.filter(
    (c) => c.required && !headers.includes(c.key),
  ).map((c) => c.key);
  if (missingRequired.length > 0) {
    errors.push({
      row: 1,
      message: `Faltan columnas obligatorias: ${missingRequired.join(", ")}`,
    });
  }

  const metafieldColumns = headers
    .map((header) => {
      const parsed = parseMetafieldHeader(header);
      return parsed ? { header, ...parsed } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const rows: CatalogRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const rowNum = i + 1;
    const row = emptyRow();

    headers.forEach((header, idx) => {
      const value = (values[idx] ?? "").trim();
      if (COLUMN_KEYS.has(header)) {
        row[header as CatalogColumnKey] = value;
      } else if (parseMetafieldHeader(header)) {
        (row as Record<string, string>)[header] = value;
      }
    });

    rows.push(row);
    validateCatalogRow(row, rowNum, errors);
  }

  return { headers, rows, metafieldColumns, errors };
}

export function validateCatalogRow(
  row: CatalogRow,
  rowNum: number,
  errors: RowValidationError[],
): void {
  if (!row.handle) {
    errors.push({
      row: rowNum,
      field: "handle",
      message: "handle es obligatorio",
    });
  }
  if (!row.title) {
    errors.push({
      row: rowNum,
      field: "title",
      message: "title es obligatorio",
    });
  }
  if (row.status && !VALID_STATUS.has(row.status.toUpperCase())) {
    errors.push({
      row: rowNum,
      field: "status",
      message: "status debe ser ACTIVE, DRAFT o ARCHIVED",
    });
  }
  if (row.stock && Number.isNaN(Number(row.stock))) {
    errors.push({
      row: rowNum,
      field: "stock",
      message: "stock debe ser numérico",
    });
  }
  if (row.price && Number.isNaN(Number(row.price))) {
    errors.push({
      row: rowNum,
      field: "price",
      message: "price debe ser numérico",
    });
  }
  if (row.compare_at_price && Number.isNaN(Number(row.compare_at_price))) {
    errors.push({
      row: rowNum,
      field: "compare_at_price",
      message: "compare_at_price debe ser numérico",
    });
  }
}

export function sanitizeExportFilename(
  name: string,
  fallbackPrefix = "catalogo",
): string {
  const trimmed = name.trim();
  const base = trimmed
    ? trimmed
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 100)
    : `${fallbackPrefix}-${new Date().toISOString().slice(0, 10)}`;

  const lower = base.toLowerCase();
  if (lower.endsWith(".xlsx")) return base;
  if (lower.endsWith(".csv")) return base.replace(/\.csv$/i, ".xlsx");
  return `${base}.xlsx`;
}

export function catalogExportRowsToSheetData(rows: CatalogRow[]): string[][] {
  const headers = EXPORT_CATALOG_COLUMNS.map((c) => c.key);
  return [
    headers,
    ...rows.map((row) =>
      EXPORT_CATALOG_COLUMNS.map((col) => row[col.key] ?? ""),
    ),
  ];
}

export function catalogRowsToSheetData(
  rows: CatalogRow[],
  metafieldHeaders: string[] = [],
): string[][] {
  const headers = [...CATALOG_COLUMNS.map((c) => c.key), ...metafieldHeaders];

  return [
    headers,
    ...rows.map((row) =>
      headers.map((h) => {
        if (COLUMN_KEYS.has(h)) {
          return row[h as CatalogColumnKey] ?? "";
        }
        return (row as Record<string, string>)[h] ?? "";
      }),
    ),
  ];
}

export function rowsToCsv(
  rows: CatalogRow[],
  metafieldHeaders: string[] = [],
): string {
  const headers = [...CATALOG_COLUMNS.map((c) => c.key), ...metafieldHeaders];
  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          if (COLUMN_KEYS.has(h)) {
            return escapeCsvField(row[h as CatalogColumnKey] ?? "");
          }
          return escapeCsvField((row as Record<string, string>)[h] ?? "");
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}

export function extractMetafieldValues(
  headers: string[],
  values: string[],
): { namespace: string; key: string; value: string }[] {
  const result: { namespace: string; key: string; value: string }[] = [];
  headers.forEach((header, idx) => {
    const parsed = parseMetafieldHeader(header);
    const value = (values[idx] ?? "").trim();
    if (parsed && value) {
      result.push({ ...parsed, value });
    }
  });
  return result;
}

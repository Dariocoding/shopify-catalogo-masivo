import * as XLSX from "xlsx";

import {
  catalogExportRowsToSheetData,
  EXPORT_CATALOG_COLUMNS,
  type CatalogRow,
} from "./catalog-schema";

const MIN_COL_WIDTH = 8;
const DEFAULT_MAX_COL_WIDTH = 55;
const HEADER_PADDING = 2;
const CELL_PADDING = 2;

type ColumnWidthRule = {
  header: string;
  maxWidth?: number;
};

function columnWidthsForSheet(
  sheetData: string[][],
  rules: ColumnWidthRule[] = [],
): { wch: number }[] {
  if (sheetData.length === 0) return [];

  const columnCount = sheetData[0].length;
  return Array.from({ length: columnCount }, (_, colIndex) => {
    const header = String(sheetData[0][colIndex] ?? "");
    const rule = rules[colIndex];
    const maxWidth = rule?.maxWidth ?? DEFAULT_MAX_COL_WIDTH;

    let maxLen = MIN_COL_WIDTH;

    for (const row of sheetData) {
      const value = String(row[colIndex] ?? "");
      const lines = value.split(/\r?\n/);
      const longestLine = lines.reduce(
        (max, line) => Math.max(max, line.length),
        0,
      );
      maxLen = Math.max(maxLen, longestLine);
    }

    const headerLen = header.length;
    const width = Math.max(maxLen, headerLen) + CELL_PADDING + HEADER_PADDING;

    return {
      wch: Math.min(Math.max(width, MIN_COL_WIDTH), maxWidth),
    };
  });
}

function applySheetFormatting(
  worksheet: XLSX.WorkSheet,
  sheetData: string[][],
  rules: ColumnWidthRule[] = [],
) {
  worksheet["!cols"] = columnWidthsForSheet(sheetData, rules);
  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };
}

export function buildCatalogXlsxBuffer(
  rows: CatalogRow[],
  metafieldHeaders: string[] = [],
): Buffer {
  const sheetData = catalogExportRowsToSheetData(rows, metafieldHeaders);
  const widthRules = [
    ...EXPORT_CATALOG_COLUMNS.map((col) => ({
      header: col.key,
      maxWidth: col.maxWidth,
    })),
    ...metafieldHeaders.map((header) => ({
      header,
      maxWidth: 40,
    })),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  applySheetFormatting(worksheet, sheetData, widthRules);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Catálogo");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

import prisma from "../db.server";
import {
  describeExportFilters,
  type ExportFilters,
} from "./catalog-export-filters";

export type ExportHistoryEntry = {
  id: string;
  filename: string;
  productCount: number;
  filtersLabel: string;
  createdAt: string;
};

export async function listExportHistory(
  shop: string,
  limit = 10,
): Promise<ExportHistoryEntry[]> {
  const rows = await prisma.exportHistory.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    productCount: row.productCount,
    filtersLabel: row.filtersLabel ?? "sin filtros",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function recordExportHistory(
  shop: string,
  input: {
    filename: string;
    productCount: number;
    filters: ExportFilters;
    collectionTitles: Record<string, string>;
  },
): Promise<void> {
  const filtersLabel = describeExportFilters(
    input.filters,
    input.collectionTitles,
  );

  await prisma.exportHistory.create({
    data: {
      shop,
      filename: input.filename,
      productCount: input.productCount,
      filtersJson: JSON.stringify(input.filters),
      filtersLabel,
    },
  });
}

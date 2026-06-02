export type ExportFilters = {
  collectionId: string;
  vendor: string;
  status: "" | "ACTIVE" | "DRAFT" | "ARCHIVED";
  tag: string;
};

export const EMPTY_EXPORT_FILTERS: ExportFilters = {
  collectionId: "",
  vendor: "",
  status: "",
  tag: "",
};

export function parseExportFilters(raw: string | null): ExportFilters {
  if (!raw) return { ...EMPTY_EXPORT_FILTERS };

  try {
    const parsed = JSON.parse(raw) as Partial<ExportFilters>;
    const status = parsed.status ?? "";
    const validStatus =
      status === "ACTIVE" || status === "DRAFT" || status === "ARCHIVED"
        ? status
        : "";

    return {
      collectionId: String(parsed.collectionId ?? "").trim(),
      vendor: String(parsed.vendor ?? "").trim(),
      status: validStatus,
      tag: String(parsed.tag ?? "").trim(),
    };
  } catch {
    return { ...EMPTY_EXPORT_FILTERS };
  }
}

function collectionSearchId(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match?.[1] ?? gid;
}

export function buildProductSearchQuery(filters: ExportFilters): string | undefined {
  const parts: string[] = [];

  if (filters.collectionId) {
    parts.push(`collection_id:${collectionSearchId(filters.collectionId)}`);
  }
  if (filters.vendor) {
    parts.push(`vendor:${filters.vendor}`);
  }
  if (filters.status) {
    parts.push(`status:${filters.status.toLowerCase()}`);
  }
  if (filters.tag) {
    parts.push(`tag:${filters.tag}`);
  }

  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

export function describeExportFilters(
  filters: ExportFilters,
  collectionTitles: Record<string, string>,
): string {
  const parts: string[] = [];

  if (filters.collectionId) {
    const title =
      collectionTitles[filters.collectionId] ?? filters.collectionId;
    parts.push(`colección: ${title}`);
  }
  if (filters.vendor) parts.push(`vendor: ${filters.vendor}`);
  if (filters.status) parts.push(`estado: ${filters.status}`);
  if (filters.tag) parts.push(`tag: ${filters.tag}`);

  return parts.length > 0 ? parts.join(", ") : "sin filtros";
}

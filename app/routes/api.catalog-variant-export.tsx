import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import {
  getCollectionOptions,
  exportVariantCatalog,
} from "../lib/catalog-export.server";
import { recordExportHistory } from "../lib/catalog-export-history.server";
import { parseExportFilters } from "../lib/catalog-export-filters";
import { buildCatalogXlsxBuffer } from "../lib/catalog-xlsx.server";
import { sanitizeExportFilename } from "../lib/catalog-schema";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const filters = parseExportFilters(String(formData.get("filters") ?? ""));
    const filename = sanitizeExportFilename(
      String(formData.get("filename") ?? ""),
      "variantes",
    );

    const collections = await getCollectionOptions(admin.graphql);
    const collectionTitles = Object.fromEntries(
      collections.map((collection) => [collection.id, collection.title]),
    );

    const result = await exportVariantCatalog(admin.graphql, filters);
    const buffer = buildCatalogXlsxBuffer(
      result.rows,
      result.metafieldHeaders,
    );

    await recordExportHistory(session.shop, {
      filename,
      productCount: result.productCount,
      filters,
      collectionTitles,
      onlyMultiVariant: true,
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Count": String(result.productCount),
        "X-Export-Variant-Count": String(result.variantCount),
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    const message =
      error instanceof Error
        ? error.message
        : "Error al exportar variantes.";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const loader = () =>
  Response.json({ error: "Usa POST para exportar." }, { status: 405 });

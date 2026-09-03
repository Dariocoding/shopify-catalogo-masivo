import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInventorySetQuantitiesInput,
  importCatalogBatch,
} from "./catalog-import.server";
import type { ParsedCatalog } from "./catalog-schema";

describe("buildInventorySetQuantitiesInput", () => {
  it("usa el shape de Admin API 2025-10 (sin changeFromQuantity)", () => {
    const input = buildInventorySetQuantitiesInput(
      "gid://shopify/InventoryItem/1",
      "gid://shopify/Location/2",
      42,
    );

    assert.deepEqual(input, {
      name: "available",
      reason: "correction",
      ignoreCompareQuantity: true,
      quantities: [
        {
          inventoryItemId: "gid://shopify/InventoryItem/1",
          locationId: "gid://shopify/Location/2",
          quantity: 42,
        },
      ],
    });

    const quantity = (input.quantities as Array<Record<string, unknown>>)[0];
    assert.equal("changeFromQuantity" in quantity, false);
  });
});

describe("importCatalogBatch stock update", () => {
  it("envía inventorySetQuantities sin changeFromQuantity", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> =
      [];

    const graphql = async (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => {
      calls.push({ query, variables: options?.variables });

      if (query.includes("ImportPrimaryLocation")) {
        return jsonResponse({
          data: { locations: { nodes: [{ id: "gid://shopify/Location/10" }] } },
        });
      }

      if (query.includes("ImportProductContext")) {
        return jsonResponse({
          data: {
            productByHandle: {
              id: "gid://shopify/Product/100",
              variants: {
                nodes: [
                  {
                    id: "gid://shopify/ProductVariant/200",
                    sku: "SKU-1",
                    inventoryItem: { id: "gid://shopify/InventoryItem/300" },
                  },
                ],
              },
            },
          },
        });
      }

      if (query.includes("CatalogProductSet")) {
        return jsonResponse({
          data: {
            productSet: {
              product: { id: "gid://shopify/Product/100", handle: "serum" },
              userErrors: [],
            },
          },
        });
      }

      if (query.includes("CatalogInventorySetQuantities")) {
        return jsonResponse({
          data: { inventorySetQuantities: { userErrors: [] } },
        });
      }

      return jsonResponse({ data: {} });
    };

    const parsed: ParsedCatalog = {
      headers: ["handle", "title", "stock"],
      metafieldColumns: [],
      rows: [
        {
          handle: "serum",
          title: "Serum",
          description_html: "",
          vendor: "",
          product_type: "",
          tags: "",
          status: "",
          variant_id: "",
          variant_options: "",
          sku: "SKU-1",
          stock: "15",
          price: "",
          compare_at_price: "",
          barcode: "",
        },
      ],
      errors: [],
    };

    const batch = await importCatalogBatch(graphql, parsed, 0, 1);
    assert.equal(batch.results.length, 1);
    assert.equal(batch.results[0].success, true, batch.results[0].errors.join("; "));

    const inventoryCall = calls.find((c) =>
      c.query.includes("CatalogInventorySetQuantities"),
    );
    assert.ok(inventoryCall, "debe llamar inventorySetQuantities");

    const input = inventoryCall!.variables?.input as Record<string, unknown>;
    assert.equal(input.ignoreCompareQuantity, true);
    assert.equal(input.name, "available");
    assert.equal(input.reason, "correction");

    const quantities = input.quantities as Array<Record<string, unknown>>;
    assert.equal(quantities.length, 1);
    assert.deepEqual(quantities[0], {
      inventoryItemId: "gid://shopify/InventoryItem/300",
      locationId: "gid://shopify/Location/10",
      quantity: 15,
    });
    assert.equal("changeFromQuantity" in quantities[0], false);
  });

  it("reporta errores GraphQL de nivel superior en stock", async () => {
    const graphql = async (query: string) => {
      if (query.includes("ImportPrimaryLocation")) {
        return jsonResponse({
          data: { locations: { nodes: [{ id: "gid://shopify/Location/10" }] } },
        });
      }
      if (query.includes("ImportProductContext")) {
        return jsonResponse({
          data: {
            productByHandle: {
              id: "gid://shopify/Product/100",
              variants: {
                nodes: [
                  {
                    id: "gid://shopify/ProductVariant/200",
                    sku: "SKU-1",
                    inventoryItem: { id: "gid://shopify/InventoryItem/300" },
                  },
                ],
              },
            },
          },
        });
      }
      if (query.includes("CatalogProductSet")) {
        return jsonResponse({
          data: {
            productSet: {
              product: { id: "gid://shopify/Product/100", handle: "serum" },
              userErrors: [],
            },
          },
        });
      }
      if (query.includes("CatalogInventorySetQuantities")) {
        return jsonResponse({
          data: null,
          errors: [
            {
              message:
                "Variable $input of type InventorySetQuantitiesInput! was provided invalid value for quantities.0.changeFromQuantity (Field is not defined on InventoryQuantityInput)",
            },
          ],
        });
      }
      return jsonResponse({ data: {} });
    };

    const parsed: ParsedCatalog = {
      headers: ["handle", "title", "stock"],
      metafieldColumns: [],
      rows: [
        {
          handle: "serum",
          title: "Serum",
          description_html: "",
          vendor: "",
          product_type: "",
          tags: "",
          status: "",
          variant_id: "",
          variant_options: "",
          sku: "SKU-1",
          stock: "15",
          price: "",
          compare_at_price: "",
          barcode: "",
        },
      ],
      errors: [],
    };

    const batch = await importCatalogBatch(graphql, parsed, 0, 1);
    assert.equal(batch.results[0].success, false);
    assert.match(
      batch.results[0].errors.join(" "),
      /changeFromQuantity|InventoryQuantityInput/,
    );
  });
});

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

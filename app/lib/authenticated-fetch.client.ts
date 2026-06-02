import type { ShopifyGlobal } from "@shopify/app-bridge-types";

/**
 * POST/GET autenticados desde la app embebida.
 * Incluye shop/host de la URL y el token de sesión de App Bridge.
 */
export async function authenticatedAppFetch(
  shopify: ShopifyGlobal,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const search =
    typeof window !== "undefined" ? window.location.search : "";
  const url = `${pathname}${search}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set(
      "Accept",
      "application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
    );
  }

  try {
    const token = await shopify.idToken();
    headers.set("Authorization", `Bearer ${token}`);
  } catch {
    // Sin token: seguir con shop/host en la URL
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "same-origin",
  });
}

export async function readFetchError(response: Response): Promise<string> {
  const text = await response.text();
  const trimmed = text.trimStart();

  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    return "Sesión no válida. Abre la app desde el admin de Shopify (Apps → tu app) y recarga.";
  }

  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(text) as { error?: string; message?: string };
      return data.error ?? data.message ?? `Error ${response.status}`;
    } catch {
      return `Error ${response.status}`;
    }
  }

  return text.slice(0, 200) || `Error ${response.status}`;
}

export function isExcelResponse(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return (
    type.includes("spreadsheetml") ||
    type.includes("octet-stream") ||
    type.includes("application/vnd.ms-excel")
  );
}

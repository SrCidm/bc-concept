import "server-only";

/**
 * ⚠️ ENDPOINTS DE BIGBUY — A CONFIRMAR CONTRA EL SANDBOX.
 *
 * Confirmado por la documentación pública: base `https://api.bigbuy.eu`
 * (sandbox `https://api.sandbox.bigbuy.eu`), auth `Authorization: Bearer <KEY>`,
 * paginación `page` / `pageSize`, y que existen catálogo, stock, información
 * por idioma, imágenes y variaciones.
 *
 * NO confirmado (de memoria; no se puede probar sin BIGBUY_API_KEY): rutas
 * exactas, nombres de parámetros de filtro y de campos de respuesta. Toda esa
 * incertidumbre vive SOLO en este archivo, en `raw.ts` y en `mappers.ts`.
 */

export const BIGBUY_DEFAULT_BASE = "https://api.bigbuy.eu";

export const BIGBUY_ENDPOINTS = {
  /** Sonda barata para validar la credencial. */
  probe: "/rest/catalog/taxonomies.json",
  products: "/rest/catalog/products.json",
  product: (id: string) => `/rest/catalog/product/${encodeURIComponent(id)}.json`,
  /** Bulk (todo el catálogo, por idioma) → se cachea con TTL. */
  productsInformation: "/rest/catalog/productsinformation.json",
  productInformation: (id: string) =>
    `/rest/catalog/productinformation/${encodeURIComponent(id)}.json`,
  productsImages: "/rest/catalog/productsimages.json",
  productImages: (id: string) => `/rest/catalog/productimages/${encodeURIComponent(id)}.json`,
  productsStock: "/rest/catalog/productsstock.json",
  productStock: (id: string) => `/rest/catalog/productstock/${encodeURIComponent(id)}.json`,
  productVariations: (id: string) =>
    `/rest/catalog/productvariations/${encodeURIComponent(id)}.json`,
} as const;

const SAFE_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * La key viaja en `Authorization`: solo se envía a HTTPS (o a localhost para el
 * servidor mock de los tests). Evita que una BIGBUY_API_BASE mal puesta la
 * mande en claro a otro host.
 */
export function assertSafeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid_base_url");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && SAFE_HTTP_HOSTS.has(url.hostname))) {
    throw new Error("invalid_base_url");
  }
  return url.origin;
}

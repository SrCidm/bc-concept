import "server-only";

/**
 * API de CJ Dropshipping (v2.0). Validado contra la API real (fase 0, ver
 * `scripts/cj-discover.ts` y `__fixtures__/`):
 *
 * · El catálogo UE sale de V1 (`/product/list`): `listV2` con `countryCode` devuelve
 *   muy poco (ES: 30 frente a 1.952 en V1). V1 está marcado como obsoleto en la
 *   documentación: si lo retiran, solo cambia este archivo y el listado de `index.ts`.
 * · El stock por almacén solo viene en `getInventoryByPid` (`query` lo trae a null).
 * · Solo el almacén de España llega a España (DE→ES y FR→ES sin rutas).
 */
export const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

export const CJ_ENDPOINTS = {
  getAccessToken: "/authentication/getAccessToken",
  refreshAccessToken: "/authentication/refreshAccessToken",
  warehouses: "/product/globalWarehouseList",
  products: "/product/list",
  product: "/product/query",
  inventory: "/product/stock/getInventoryByPid",
} as const;

/** Almacenes que se listan en el panel. El coste de envío se comprueba aparte. */
export const CJ_LISTED_WAREHOUSES: readonly string[] = ["ES"];

/** Hosts de imagen observados en respuestas reales. También en next.config.mjs. */
export const CJ_IMAGE_HOSTS: ReadonlySet<string> = new Set(["cf.cjdropshipping.com", "oss-cf.cjdropshipping.com"]);

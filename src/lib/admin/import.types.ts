/**
 * Tipos y constantes del flujo de importación que usa el modal (CLIENTE).
 * Sin `server-only` ni imports de runtime: los componentes de /admin lo importan
 * (los tipos de otros módulos entran con `import type`, que se borra al compilar).
 * Es lo ÚNICO de `lib/admin` que puede importar la UI (lo vigila un test).
 */

/**
 * Categorías de tienda a elegir al importar. ÚNICO sitio de la lista cerrada:
 * la validación del servidor y el <select> del modal salen de aquí (cambiarla
 * es una línea). Valores = los del menú del footer; a validar con Yosra.
 * Las etiquetas viven en messages/es.json (`admin.import.dialog.categories.*`).
 */
export const STORE_CATEGORIES = ["lighting", "textiles", "decor"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export function isStoreCategory(v: unknown): v is StoreCategory {
  return typeof v === "string" && (STORE_CATEGORIES as readonly string[]).includes(v);
}

/** Códigos de error (nunca mensajes del proveedor ni de la BD; regla #8). */
export type ImportErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "bad_response"
  | "not_found"
  | "invalid_request"
  | "unsupported"
  /** Sin almacén UE explícito con stock (fail-closed). */
  | "not_eu_eligible"
  /** Coste o variantes en otra moneda que EUR. */
  | "currency_mismatch"
  /** Margen por debajo del mínimo y sin confirmación explícita. */
  | "margin_below_min"
  /** Fallo al escribir en la BD. */
  | "storage_failed";

/** Desglose y veredicto de la guarda de margen (calculado en el servidor). */
export interface MarginCheckDTO {
  /** PVP con IVA. */
  price: number;
  vat: number;
  netRevenue: number;
  cost: number;
  shipping: number;
  stripeFee: number;
  returnsBuffer: number;
  acquisition: number;
  netMargin: number;
  netMarginPct: number;
  /** Margen neto mínimo exigido, en %. */
  minPct: number;
  belowMin: boolean;
  loss: boolean;
  /** PVP mínimo (IVA incl.) que cumple el mínimo; null si es inalcanzable. */
  minPrice: number | null;
}

export interface ImportPreviewDTO {
  product: {
    supplierProductId: string;
    title: string;
    image: string | null;
    sku: string | null;
    /** Coste de proveedor (solo admin). */
    cost: { amount: number; currency: string };
    /** PVP recomendado por el proveedor (referencia). */
    suggestedRetail: { amount: number; currency: string } | null;
    variantCount: number;
    /** Coste más alto entre producto y variantes: el que usa la guarda. */
    worstCaseCost: number;
    /** Almacén UE elegido (el de más stock). */
    warehouse: string;
    euStock: number;
  };
  /** PVP inicial propuesto (el recomendado o, si no hay, el mínimo redondeado a ,90). */
  suggestedPrice: number | null;
  /** Guarda al precio pedido (o al inicial); null si aún no hay precio válido. */
  check: MarginCheckDTO | null;
  /** Ya existe en la tienda: guardar de nuevo no cambia nada. */
  alreadyImported: { status: "draft" | "active" | "archived" } | null;
  /** Con el mock activo el guardado es una simulación (no escribe). */
  simulated: boolean;
}

export interface ImportResultDTO {
  /** false si ya existía (idempotente: no se ha tocado nada) o si fue una simulación. */
  created: boolean;
  /** true solo si se ha escrito en la BD. */
  persisted: boolean;
  simulated: boolean;
  productId: string | null;
  status: "draft" | "active" | "archived";
  /** Se guardó con el margen por debajo del mínimo (confirmado). */
  forced: boolean;
  check: MarginCheckDTO;
}

/** HTTP por código (la ruta lo usa; vive aquí para poder testearlo sin Next). */
export const IMPORT_ERROR_STATUS: Record<ImportErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_configured: 503,
  unauthorized: 502,
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  bad_response: 502,
  not_found: 404,
  invalid_request: 400,
  unsupported: 501,
  not_eu_eligible: 422,
  currency_mismatch: 422,
  margin_below_min: 422,
  storage_failed: 500,
};

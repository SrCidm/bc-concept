/**
 * Contrato del panel /admin/productos (CLIENTE y servidor). Como `import.types`:
 * sin `server-only` y solo `import type` de otros módulos (lo vigila un test).
 */
import type { ImportErrorCode, ImportFxDTO, MarginCheckDTO, StoreCategory } from "./import.types";

export type ProductStatus = "draft" | "active" | "archived";
export type ProductSupplier = "cj" | "bigbuy";

/** Motivos por los que un borrador aún no se puede publicar (se comprueban todos a la vez). */
export const PUBLISH_REASONS = [
  "category_missing",
  "title_missing",
  "description_missing",
  /** Igual que el texto del proveedor (normalizado): los textos de CJ no se publican tal cual. */
  "title_not_reviewed",
  "description_not_reviewed",
  "title_en_not_reviewed",
  "description_en_not_reviewed",
  "sample_not_verified",
] as const;
export type PublishReason = (typeof PUBLISH_REASONS)[number];

export type ProductErrorCode =
  | Exclude<ImportErrorCode, "not_found">
  | "not_found"
  /** Solo se edita, verifica o descarta un borrador. */
  | "not_draft"
  | "not_active"
  /** El producto cambió (p. ej. el PVP) entre la comprobación y la publicación. */
  | "stale"
  /** Faltan requisitos: ver `reasons`. */
  | "publish_blocked"
  /** El proveedor ya no devuelve el producto. */
  | "supplier_not_found"
  /** El flete no da plazo de entrega (el DeliveryBadge lo necesita). */
  | "no_delivery_estimate"
  /** El último tipo publicado tiene más de 4 días. */
  | "fx_too_old"
  /** El margen bajó desde la importación: hay que confirmarlo. */
  | "margin_dropped";

export const PRODUCT_ERROR_STATUS: Record<ProductErrorCode, number> = {
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
  fx_unavailable: 503,
  no_shipping_route: 422,
  margin_below_min: 422,
  storage_failed: 500,
  not_draft: 409,
  not_active: 409,
  stale: 409,
  publish_blocked: 422,
  supplier_not_found: 422,
  no_delivery_estimate: 422,
  fx_too_old: 503,
  margin_dropped: 409,
};

/** Margen calculado hoy: coste y flete del snapshot, tipo y ajustes de hoy (sin llamar al proveedor). */
export interface MarginTodayDTO {
  check: MarginCheckDTO | null;
  /** null si hay margen; si no, por qué no se pudo calcular. */
  reason: "fx_unavailable" | "invalid" | null;
  /** El envío es el flete real guardado (true) o la media de los ajustes (false). */
  realShipping: boolean;
  /** Conversión de hoy aplicada al coste original (null si el proveedor cobra en EUR). */
  fx: ImportFxDTO | null;
}

export interface AdminProductListItem {
  id: string;
  supplier: ProductSupplier;
  image: string | null;
  title: string;
  /** Coste en EUR del snapshot (solo admin). */
  costEur: number;
  priceRetail: number;
  margin: MarginTodayDTO;
  category: StoreCategory | null;
  sampleVerified: boolean;
  status: ProductStatus;
  updatedAt: string;
}

export interface AdminProductListDTO {
  items: AdminProductListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export type ProductEventAction =
  | "import"
  | "edit"
  | "sample_verified"
  | "sample_unverified"
  | "publish"
  | "unpublish"
  | "discard";

export interface ProductEventDTO {
  id: number;
  action: ProductEventAction;
  actor: string;
  createdAt: string;
  statusBefore: ProductStatus | null;
  statusAfter: ProductStatus | null;
  priceBefore: number | null;
  priceAfter: number | null;
  /** Campos cambiados al editar. */
  fields: string[];
  /** Nota de la muestra. */
  notes: string | null;
  /** Margen comprobado al publicar (y el de la importación, si bajó). */
  marginPct: number | null;
  marginBeforePct: number | null;
}

export interface AdminProductDetailDTO {
  id: string;
  supplier: ProductSupplier;
  supplierProductId: string;
  status: ProductStatus;
  images: string[];
  title: string;
  description: string | null;
  titleEn: string | null;
  descriptionEn: string | null;
  /** Texto original del proveedor: referencia, no se publica. */
  supplierTitle: string | null;
  supplierDescription: string | null;
  category: StoreCategory | null;
  priceRetail: number;
  costEur: number;
  costOriginal: number | null;
  costCurrency: string;
  shippingEstimate: number | null;
  shippingMethod: string | null;
  deliveryMinDays: number | null;
  deliveryMaxDays: number | null;
  warehouse: string | null;
  inventory: number;
  sample: { verifiedAt: string; verifiedBy: string; notes: string } | null;
  slug: string | null;
  slugEn: string | null;
  publishedAt: string | null;
  updatedAt: string;
  /** Lo que falta para publicar, con los datos guardados (la publicación vuelve a comprobarlo todo). */
  reasons: PublishReason[];
  margin: MarginTodayDTO;
  events: ProductEventDTO[];
}

export interface PublishResultDTO {
  slug: string;
  slugEn: string;
  check: MarginCheckDTO;
  /** Margen de la importación si el fresco es menor (publicado con confirmación). */
  marginDrop: { fromPct: number; toPct: number } | null;
}

/** Límites de los textos editables (también los valida el servidor). */
export const PRODUCT_TEXT_LIMITS = {
  titleMin: 3,
  titleMax: 140,
  descriptionMax: 5000,
  sampleNotesMin: 10,
  sampleNotesMax: 1000,
} as const;

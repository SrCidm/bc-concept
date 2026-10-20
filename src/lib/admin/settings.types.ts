/**
 * Contrato client-safe de la página de ajustes de margen (/admin/ajustes).
 * Sin `server-only` ni imports de runtime: lo importan los componentes del panel.
 * La validación de verdad vive en el servidor (`lib/pricing/settingsInput.ts`);
 * los rangos están aquí para que la UI los explique sin duplicarlos.
 */

/** Campos que Yosra puede editar (el IVA no: es fijo en código). */
export const MARGIN_FIELDS = [
  "targetMinPct",
  "targetMaxPct",
  "shippingCost",
  "acquisitionCost",
  "returnsBufferPct",
  "stripePct",
  "stripeFixed",
] as const;
export type MarginField = (typeof MARGIN_FIELDS)[number];

/** Rangos cerrados (incluidos los extremos). `targetMaxPct` además debe ser ≥ `targetMinPct`. */
export const MARGIN_RANGES: Readonly<Record<MarginField, { min: number; max: number; unit: "%" | "€" }>> = {
  returnsBufferPct: { min: 0, max: 30, unit: "%" },
  shippingCost: { min: 0, max: 100, unit: "€" },
  acquisitionCost: { min: 0, max: 200, unit: "€" },
  targetMinPct: { min: 0, max: 80, unit: "%" },
  targetMaxPct: { min: 0, max: 100, unit: "%" },
  stripePct: { min: 0, max: 10, unit: "%" },
  stripeFixed: { min: 0, max: 2, unit: "€" },
};

/** Longitud máxima de la nota opcional. */
export const MARGIN_NOTE_MAX = 280;

export type MarginValuesDTO = Record<MarginField, number>;

/** Ejemplo calculado en el servidor: "con un coste de 20 €, el PVP mínimo es X €". */
export interface MarginExampleDTO {
  cost: number;
  /** PVP (IVA incl.) mínimo para el margen mínimo; null si es inalcanzable con estos ajustes. */
  minPrice: number | null;
  /** Desglose a ese precio (null si no hay precio alcanzable). */
  breakdown: {
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
  } | null;
}

export interface MarginHistoryEntryDTO {
  id: number;
  createdBy: string;
  /** ISO 8601. */
  createdAt: string;
  note: string | null;
  values: MarginValuesDTO;
  /** Campos que cambiaron respecto al guardado anterior (vacío en el primero). */
  changed: MarginField[];
}

export interface MarginSettingsPanelDTO {
  /** IVA aplicado (fijo en código, solo lectura). */
  vatPct: number;
  /** Valores vigentes (los que usa ahora la guarda). */
  values: MarginValuesDTO;
  /** De dónde salen: BD (guardados desde el panel), variables de entorno o valores por defecto. */
  origin: "db" | "env" | "defaults";
  /** No se pudo leer la BD: se están usando entorno/valores por defecto. */
  degraded: boolean;
  /** "memory" solo en desarrollo (MARGIN_SETTINGS_MEMORY=1): lo guardado no llega a la BD. */
  storage: "db" | "memory";
  savedBy: string | null;
  savedAt: string | null;
  note: string | null;
  history: MarginHistoryEntryDTO[];
  example: MarginExampleDTO;
}

export type MarginSettingsErrorCode = "unauthenticated" | "forbidden" | "invalid_request" | "storage_failed";

export const MARGIN_SETTINGS_ERROR_STATUS: Record<MarginSettingsErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid_request: 400,
  storage_failed: 500,
};

/** Coste de referencia del ejemplo en vivo. */
export const EXAMPLE_COST = 20;

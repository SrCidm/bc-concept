import "server-only";
import type { WarehouseStock } from "../types";

/** Estados miembros de la UE (ISO 3166-1 alpha-2). Solo almacén UE (regla #5). */
export const EU_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export function normalizeWarehouse(raw: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return code === "" ? null : code;
}

/**
 * ¿Cuenta como almacén UE? Si BigBuy NO informa del país (null) se asume UE:
 * es un proveedor europeo con almacenes en la UE. ⚠️ Suposición: revisarla al
 * validar la respuesta real (si el campo existe, se aplica el filtro estricto).
 */
export function isEuWarehouse(warehouse: string | null): boolean {
  return warehouse === null || EU_COUNTRY_CODES.has(warehouse);
}

export function filterEuStock(entries: WarehouseStock[]): WarehouseStock[] {
  return entries.filter((e) => isEuWarehouse(e.warehouse));
}

/** Rango de días de manipulación entre los almacenes UE con existencias. */
export function summarizeHandling(entries: WarehouseStock[]): {
  minDays: number | null;
  maxDays: number | null;
} {
  const live = entries.filter((e) => e.quantity > 0);
  const mins = live.map((e) => e.minHandlingDays).filter((n): n is number => n !== null);
  const maxs = live.map((e) => e.maxHandlingDays).filter((n): n is number => n !== null);
  return {
    minDays: mins.length ? Math.min(...mins) : null,
    maxDays: maxs.length ? Math.max(...maxs) : null,
  };
}

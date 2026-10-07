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
 * es un proveedor europeo con almacenes en la UE. ⚠️ Suposición PROVISIONAL.
 *
 * TODO(crítico · Hito 3, al validar contra el sandbox con BIGBUY_API_KEY):
 *   pasar a FAIL-CLOSED. "Almacén desconocido" debe ser NO elegible UE
 *   (excluir del listado o marcar como `euEligible: false` / "almacén sin
 *   verificar"), no UE. Afecta a la promesa de entrega del negocio (solo
 *   almacén UE, regla #5): un producto con almacén desconocido no puede
 *   ofrecerse con plazos de entrega UE. Al cambiarlo, actualizar también:
 *     · isEuWarehouse(null) → false
 *     · tests de bigbuy.test.ts ("null se asume UE" y el fixture 1005)
 *     · el fixture STOCK[1005] (stocks sin `warehouse`) y los resultados
 *       esperados de listProducts
 *   No se hace ahora porque sin la respuesta real no sabemos si BigBuy
 *   expone el país del almacén (si no lo expone, TODO el catálogo quedaría
 *   fuera): hay que ver el campo real primero.
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

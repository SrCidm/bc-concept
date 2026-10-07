import "server-only";
import { SupplierError } from "./errors";
import { createBigBuyAdapter } from "./bigbuy";
import type { SupplierAdapter, SupplierId } from "./types";

const KNOWN: ReadonlySet<string> = new Set<SupplierId>(["bigbuy", "cj"]);

/** Valida el segmento de URL `[supplier]` contra la lista cerrada de proveedores. */
export function parseSupplierId(raw: string): SupplierId | null {
  return KNOWN.has(raw) ? (raw as SupplierId) : null;
}

let bigbuy: SupplierAdapter | null = null;

/**
 * Proveedor → adaptador. CJ está pendiente de migrar a esta interfaz (hoy vive
 * en `src/lib/cj/` con el proveedor cableado): responde 501, sin tocar nada.
 */
export function getSupplierAdapter(id: SupplierId): SupplierAdapter {
  if (id === "bigbuy") {
    bigbuy ??= createBigBuyAdapter();
    return bigbuy;
  }
  throw new SupplierError("unsupported");
}

import "server-only";
import { getCredentialStatus } from "@/lib/suppliers/credentials";
import { isMockEnabled } from "@/lib/suppliers/registry";
import type { SupplierId } from "@/lib/suppliers/types";

/** Orden del selector de /admin/import: el principal primero. */
export const IMPORT_SUPPLIERS: readonly SupplierId[] = ["cj", "bigbuy"];

export interface ImportSupplierOption {
  id: SupplierId;
  /** Tiene credencial (o catálogo de ejemplo). Sin ella, el selector dice "no conectado". */
  connected: boolean;
}

/**
 * Estado de los proveedores para el selector del panel: solo sí/no, nunca la
 * credencial. Un fallo al leer cuenta como no conectado. Lo usa una página que ya
 * ha pasado por `requireAdminPage`.
 */
export async function importSupplierOptions(
  deps: { status?: (id: SupplierId) => Promise<{ configured: boolean }>; isMock?: () => boolean } = {},
): Promise<ImportSupplierOption[]> {
  const status = deps.status ?? ((id: SupplierId) => getCredentialStatus(id));
  const isMock = deps.isMock ?? isMockEnabled;
  return Promise.all(
    IMPORT_SUPPLIERS.map(async (id) => {
      if (id === "bigbuy" && isMock()) return { id, connected: true };
      try {
        return { id, connected: (await status(id)).configured };
      } catch {
        return { id, connected: false };
      }
    }),
  );
}

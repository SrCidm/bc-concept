import "server-only";
import { resolveAdmin, type AdminDecision } from "@/lib/auth/requireAdmin";
import { fxSource, type FxQuote } from "@/lib/pricing/fx";
import type { MarginParams } from "@/lib/pricing/margin";
import { marginSettings } from "@/lib/pricing/settings";
import { toAdminPageDTO } from "@/lib/suppliers/dto";
import type { AdminProductPageDTO } from "@/lib/suppliers/dto.types";
import { isSupplierError, type SupplierErrorCode } from "@/lib/suppliers/errors";
import { getSupplierAdapter, isCatalogMock } from "@/lib/suppliers/registry";
import type { SupplierAdapter, SupplierId } from "@/lib/suppliers/types";

/**
 * Catálogo del proveedor para el panel. ESTA es la función que trae el coste.
 *
 * AUTO-GUARDADA: comprueba la sesión de admin ella misma, ANTES de construir o
 * invocar el adaptador. No se apoya en el layout (los layouts de Next no se
 * re-ejecutan en navegación cliente) ni en que quien la llame ya lo hiciera.
 * Sin sesión → `unauthenticated`; sesión que no es admin → `forbidden`; en
 * ambos casos no se llama al proveedor. Fail-closed: si la comprobación lanza,
 * se deniega.
 *
 * Solo devuelve códigos de error (nunca mensajes, URLs ni cuerpos del
 * proveedor; regla #8).
 */

export interface AdminCatalogQuery {
  /** Por defecto, el proveedor principal (CJ). */
  supplier?: SupplierId;
  page: number;
  pageSize: number;
  category?: string;
  query?: string;
  lang: "es" | "en";
  euOnly: boolean;
  inStockOnly: boolean;
  /** Por defecto true (ver `ListProductsParams.curatedOnly`). */
  curatedOnly?: boolean;
}

export type AdminCatalogErrorCode = "unauthenticated" | "forbidden" | SupplierErrorCode;

export type AdminCatalogResult =
  | { ok: true; data: AdminProductPageDTO; source: "mock" | "live" }
  | { ok: false; code: AdminCatalogErrorCode };

export interface AdminCatalogDeps {
  resolve?: () => Promise<AdminDecision>;
  getAdapter?: () => SupplierAdapter;
  getMarginParams?: () => Promise<MarginParams | null>;
  getFx?: () => Promise<FxQuote>;
  isMock?: () => boolean;
}

export async function listAdminCatalog(
  query: AdminCatalogQuery,
  deps: AdminCatalogDeps = {}
): Promise<AdminCatalogResult> {
  // 1) Sesión primero. Nada del proveedor se toca antes de este punto.
  let decision: AdminDecision;
  try {
    decision = await (deps.resolve ?? resolveAdmin)();
  } catch {
    return { ok: false, code: "unauthenticated" };
  }
  if (!decision.ok) return { ok: false, code: decision.code };

  // 2) Proveedor.
  try {
    const supplier = query.supplier ?? "cj";
    const adapter = (deps.getAdapter ?? (() => getSupplierAdapter(supplier)))();
    const page = await adapter.listProducts({
      page: query.page,
      pageSize: query.pageSize,
      category: query.category,
      query: query.query,
      lang: query.lang,
      euOnly: query.euOnly,
      inStockOnly: query.inStockOnly,
      curatedOnly: query.curatedOnly,
    });
    const params = await (deps.getMarginParams ?? (() => marginSettings().get()))();
    // El tipo de cambio solo se pide si hace falta (BigBuy cobra en EUR).
    const needsFx = page.items.some((p) => p.cost.currency !== "EUR");
    const fx = needsFx ? await (deps.getFx ?? (() => fxSource().get()))() : null;
    return {
      ok: true,
      data: toAdminPageDTO(page, params, fx),
      source: (deps.isMock ?? (() => isCatalogMock(supplier)))() ? "mock" : "live",
    };
  } catch (e) {
    if (isSupplierError(e)) return { ok: false, code: e.code };
    console.error("[admin catalog] unexpected error");
    return { ok: false, code: "upstream" };
  }
}

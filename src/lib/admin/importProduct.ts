import "server-only";
import { resolveAdmin, type AdminDecision } from "@/lib/auth/requireAdmin";
import { usdToEur } from "@/lib/pricing/fx";
import { evaluateMarginGuard, minimumPrice, type MarginCheck } from "@/lib/pricing/guard";
import type { MarginParams } from "@/lib/pricing/margin";
import { marginSettings } from "@/lib/pricing/settings";
import { isSupplierError } from "@/lib/suppliers/errors";
import { isSimulatedImport } from "@/lib/suppliers/registry";
import type { SupplierId, SupplierProduct } from "@/lib/suppliers/types";
import {
  isStoreCategory,
  type ImportErrorCode,
  type ImportFxDTO,
  type ImportPreviewDTO,
  type ImportResultDTO,
  type MarginCheckDTO,
  type StoreCategory,
} from "./import.types";
import {
  assess,
  buildRows,
  CONVERTIBLE,
  loadSupplierProduct,
  type Assessment,
  type ProductRow,
  type SupplierSnapshotDeps,
  type VariantRow,
} from "./supplierSnapshot";

export { htmlToPlainText, type ProductRow, type VariantRow } from "./supplierSnapshot";

/**
 * Importación de un producto del proveedor a `products` como BORRADOR.
 *
 * · AUTO-GUARDADA (igual que `listAdminCatalog`): la sesión de admin se comprueba
 *   aquí, antes de construir el adaptador o tocar la BD; no se confía en la ruta.
 * · El CLIENTE solo manda id, PVP, categoría y confirmación. Coste, almacén,
 *   imágenes y variantes salen SIEMPRE del proveedor (re-pedido aquí); estado,
 *   título y slug nunca vienen del cliente.
 * · La guarda de margen (`lib/pricing/guard`) se aplica en el servidor: por debajo
 *   del mínimo hace falta `confirmBelowMargin === true`.
 * · El coste se guarda SIEMPRE en EUR (`price_cost`), con su snapshot: coste
 *   original, moneda, tipo, fecha y colchón. Sin tipo reciente no se importa.
 * · Solo almacén UE y fail-closed: un almacén desconocido NO cuenta (el listado es
 *   más permisivo; ver la deuda en bigbuy/warehouses.ts).
 * · Idempotente: si (supplier, supplier_product_id) ya existe no se escribe ni se
 *   pisa nada (ni precio ni título editados); solo se completan variantes que falten.
 * · En simulación (mock de BigBuy; CJ salvo `CJ_IMPORT_ENABLED=1`) NO se escribe nada: la
 *   escritura es una simulación y no se llama al almacén, ni para leer.
 * · Errores: solo códigos (regla #8), nunca mensajes del proveedor ni de la BD.
 */

export type ProductStatus = "draft" | "active" | "archived";

/** Almacén de productos: Supabase (service role) en real, en memoria en tests, nulo con el mock. */
export interface ProductStore {
  findProduct(supplier: SupplierId, supplierProductId: string): Promise<{ id: string; status: ProductStatus } | null>;
  /** Inserta si no existe (ignoreDuplicates): NUNCA pisa una fila existente. */
  insertProduct(row: ProductRow): Promise<{ id: string; created: boolean }>;
  /** Inserta las que falten (ignoreDuplicates); no toca las existentes. */
  insertVariants(productId: string, rows: VariantRow[]): Promise<void>;
  /** Historial (`product_events`): un borrador nuevo deja su evento `import`. */
  recordImport?(e: ImportEvent): Promise<void>;
}

export interface ImportEvent {
  productId: string;
  supplier: SupplierId;
  supplierProductId: string;
  actor: string;
  price: number;
  forced: boolean;
  marginPct: number;
}

export interface ImportDeps extends SupplierSnapshotDeps {
  resolve?: () => Promise<AdminDecision>;
  getParams?: () => Promise<MarginParams>;
  store?: ProductStore;
  isMock?: () => boolean;
}

export type ImportPreviewResult =
  | { ok: true; data: ImportPreviewDTO }
  | { ok: false; code: ImportErrorCode };

export type ImportSaveResult =
  | { ok: true; data: ImportResultDTO }
  | { ok: false; code: ImportErrorCode; check?: MarginCheckDTO };

// ---------------------------------------------------------------- entrada

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PRICE = 99_999;

interface ParsedInput {
  supplierProductId: string;
  priceRetail: number | undefined;
  category: StoreCategory | null;
  confirmBelowMargin: boolean;
}

/** Valida (no "corrige"). Ignora cualquier campo extra del cliente. */
function parseInput(raw: unknown, requirePrice: boolean): ParsedInput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (typeof o.supplierProductId !== "string" || !ID_PATTERN.test(o.supplierProductId)) return null;

  let priceRetail: number | undefined;
  if (o.priceRetail !== undefined && o.priceRetail !== null) {
    const p = o.priceRetail;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0.01 || p > MAX_PRICE) return null;
    if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) return null; // máx. 2 decimales
    priceRetail = p;
  } else if (requirePrice) {
    return null;
  }

  let category: StoreCategory | null = null;
  if (o.category !== undefined && o.category !== null) {
    if (!isStoreCategory(o.category)) return null;
    category = o.category;
  }

  let confirmBelowMargin = false;
  if (o.confirmBelowMargin !== undefined) {
    if (typeof o.confirmBelowMargin !== "boolean") return null;
    confirmBelowMargin = o.confirmBelowMargin;
  }

  return { supplierProductId: o.supplierProductId, priceRetail, category, confirmBelowMargin };
}

// ------------------------------------------------------------ utilidades

/** Siguiente precio acabado en ,90 que no baje del mínimo (39,17 → 39,90; 39,95 → 40,90). */
function roundUpToNinety(price: number): number {
  let candidate = Math.floor(price) + 0.9;
  if (candidate < price) candidate += 1;
  return Math.round(candidate * 100) / 100;
}

function toFxDTO(currency: string, originalCost: number, fx: NonNullable<Assessment["fx"]>): ImportFxDTO {
  return { currency, originalCost, rate: fx.rate, rateDate: fx.rateDate, bufferPct: fx.bufferPct, stale: fx.stale, ageDays: fx.ageDays };
}

/** PVP recomendado en EUR, al tipo oficial (sin colchón: es una referencia, no un coste). */
function suggestedRetailEur(product: SupplierProduct, rate: number | null): { amount: number; currency: "EUR" } | null {
  const rrp = product.suggestedRetail;
  if (!rrp) return null;
  if (rrp.currency === "EUR") return { amount: rrp.amount, currency: "EUR" };
  return rate !== null && CONVERTIBLE.has(rrp.currency) ? { amount: usdToEur(rrp.amount, rate), currency: "EUR" } : null;
}

function toCheckDTO(c: MarginCheck): MarginCheckDTO {
  return { ...c.breakdown, minPct: c.minPct, belowMin: c.belowMin, loss: c.loss, minPrice: c.minPrice };
}

// ------------------------------------------------------------ almacenes

/** Simulación (mock): no toca nada. */
const dryRunStore: ProductStore = {
  async findProduct() {
    return null;
  },
  async insertProduct() {
    return { id: "simulated", created: true };
  },
  async insertVariants() {},
};

/** Supabase con service role (solo servidor, tras requireAdmin). */
export const supabaseProductStore: ProductStore = {
  async findProduct(supplier, supplierProductId) {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, status")
      .eq("supplier", supplier)
      .eq("supplier_product_id", supplierProductId)
      .maybeSingle();
    if (error) {
      console.error("[admin import] product lookup failed:", error.code);
      throw new Error("storage_failed");
    }
    if (!data) return null;
    const status = data.status === "active" || data.status === "archived" ? data.status : "draft";
    return { id: data.id as string, status };
  },

  async insertProduct(row) {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin
      .from("products")
      .upsert(row, { onConflict: "supplier,supplier_product_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[admin import] product insert failed:", error.code);
      throw new Error("storage_failed");
    }
    if (data && data.length > 0) return { id: data[0].id as string, created: true };
    // Ya existía (otra importación simultánea o previa): no se ha pisado nada.
    const existing = await this.findProduct(row.supplier, row.supplier_product_id);
    if (!existing) throw new Error("storage_failed");
    return { id: existing.id, created: false };
  },

  async recordImport(e) {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { error } = await supabaseAdmin.from("product_events").insert({
      product_id: e.productId,
      supplier: e.supplier,
      supplier_product_id: e.supplierProductId,
      action: "import",
      actor: e.actor,
      status_after: "draft",
      price_after: e.price,
      details: { forced: e.forced, margin_pct: e.marginPct },
    });
    if (error) throw new Error("storage_failed");
  },

  async insertVariants(productId, rows) {
    if (rows.length === 0) return;
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { error } = await supabaseAdmin
      .from("product_variants")
      .upsert(
        rows.map((r) => ({ ...r, product_id: productId })),
        { onConflict: "supplier,supplier_variant_id", ignoreDuplicates: true }
      );
    if (error) {
      console.error("[admin import] variants insert failed:", error.code);
      throw new Error("storage_failed");
    }
  },
};

/** Cualquier fallo del almacén se reduce a `storage_failed`: el texto de la BD nunca sale. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    throw new Error("storage_failed");
  }
}

// ---------------------------------------------------------------- sesión

async function authorize(deps: ImportDeps): Promise<{ ok: true; email: string } | { ok: false; code: ImportErrorCode }> {
  let decision: AdminDecision;
  try {
    decision = await (deps.resolve ?? resolveAdmin)();
  } catch {
    return { ok: false, code: "unauthenticated" };
  }
  return decision.ok ? { ok: true, email: decision.email } : { ok: false, code: decision.code };
}

function errorCode(e: unknown): ImportErrorCode {
  if (isSupplierError(e)) return e.code;
  if (e instanceof Error && e.message === "storage_failed") return "storage_failed";
  console.error("[admin import] unexpected error");
  return "upstream";
}

// ------------------------------------------------------------------ preview

export async function previewImport(
  supplier: SupplierId,
  rawInput: unknown,
  deps: ImportDeps = {}
): Promise<ImportPreviewResult> {
  // 1) Sesión primero: nada del proveedor ni de la BD se toca antes.
  const auth = await authorize(deps);
  if (!auth.ok) return { ok: false, code: auth.code };

  const input = parseInput(rawInput, false);
  if (!input) return { ok: false, code: "invalid_request" };

  try {
    const product = await loadSupplierProduct(supplier, input.supplierProductId, deps);
    if (!product) return { ok: false, code: "not_found" };
    const params = await (deps.getParams ?? (() => marginSettings().get()))();
    const a = await assess(product, params, deps);
    if (!a.ok) return { ok: false, code: a.code };

    const overrides = a.value.shipping ? { shippingCost: a.value.shipping.cost } : {};
    const minPrice = minimumPrice(a.value.guardCost, params, overrides);
    const fx = a.value.fx;
    const rrp = suggestedRetailEur(product, fx?.rate ?? null);
    const suggestedPrice =
      rrp && rrp.amount > 0
        ? rrp.amount
        : minPrice !== null
          ? roundUpToNinety(minPrice)
          : null;

    const price = input.priceRetail ?? suggestedPrice;
    const check = price === null ? null : evaluateMarginGuard(a.value.guardCost, price, params, overrides);

    const mock = (deps.isMock ?? (() => isSimulatedImport(supplier)))();
    let alreadyImported: ImportPreviewDTO["alreadyImported"] = null;
    if (!mock) {
      const store = deps.store ?? supabaseProductStore;
      const existing = await guarded(() => store.findProduct(supplier, input.supplierProductId));
      if (existing) alreadyImported = { status: existing.status };
    }

    return {
      ok: true,
      data: {
        product: {
          supplierProductId: product.supplierProductId,
          title: product.title,
          image: product.images[0] ?? null,
          sku: product.sku,
          cost: { amount: a.value.toEur(product.cost.amount), currency: "EUR" },
          suggestedRetail: rrp,
          variantCount: product.variants.length,
          minCost: a.value.minCost,
          worstCaseCost: a.value.guardCost,
          // Céntimo de tolerancia: costes iguales con ruido de coma flotante no son un "rango".
          costVaries: a.value.guardCost - a.value.minCost >= 0.005,
          warehouse: a.value.warehouse,
          euStock: a.value.euStock,
        },
        fx: fx ? toFxDTO(product.cost.currency, a.value.worstOriginal, fx) : null,
        shipping: a.value.shipping,
        suggestedPrice,
        check: check ? toCheckDTO(check) : null,
        alreadyImported,
        simulated: mock,
      },
    };
  } catch (e) {
    return { ok: false, code: errorCode(e) };
  }
}

// ------------------------------------------------------------------- guardar

export async function importProduct(
  supplier: SupplierId,
  rawInput: unknown,
  deps: ImportDeps = {}
): Promise<ImportSaveResult> {
  const auth = await authorize(deps);
  if (!auth.ok) return { ok: false, code: auth.code };

  const input = parseInput(rawInput, true);
  if (!input || input.priceRetail === undefined) return { ok: false, code: "invalid_request" };
  const price = input.priceRetail;

  try {
    const product = await loadSupplierProduct(supplier, input.supplierProductId, deps);
    if (!product) return { ok: false, code: "not_found" };
    const params = await (deps.getParams ?? (() => marginSettings().get()))();
    const a = await assess(product, params, deps);
    if (!a.ok) return { ok: false, code: a.code };

    const overrides = a.value.shipping ? { shippingCost: a.value.shipping.cost } : {};
    const check = evaluateMarginGuard(a.value.guardCost, price, params, overrides);
    if (!check) return { ok: false, code: "bad_response" }; // coste no válido
    const checkDTO = toCheckDTO(check);

    // Guarda de margen ANTES de tocar la BD (ni siquiera para leer): por debajo del
    // mínimo hace falta confirmación EXPLÍCITA, también en la simulación.
    if (check.belowMin && !input.confirmBelowMargin) {
      return { ok: false, code: "margin_below_min", check: checkDTO };
    }
    const forced = check.belowMin;

    const mock = (deps.isMock ?? (() => isSimulatedImport(supplier)))();
    // Con el mock NUNCA se usa el almacén inyectado ni el real (BD compartida).
    const store: ProductStore = mock ? dryRunStore : (deps.store ?? supabaseProductStore);
    const rows = buildRows(product, a.value, price, input.category);

    // Idempotencia: si ya existe no se escribe ni se pisa nada (solo se completan variantes).
    if (!mock) {
      const existing = await guarded(() => store.findProduct(supplier, input.supplierProductId));
      if (existing) {
        await guarded(() => store.insertVariants(existing.id, rows.variants));
        return {
          ok: true,
          data: {
            created: false,
            persisted: false,
            simulated: false,
            productId: existing.id,
            status: existing.status,
            forced: false,
            check: checkDTO,
          },
        };
      }
    }

    if (mock) {
      return {
        ok: true,
        data: {
          created: false,
          persisted: false,
          simulated: true,
          productId: null,
          status: "draft",
          forced,
          check: checkDTO,
        },
      };
    }

    const { id, created } = await guarded(() => store.insertProduct(rows.product));
    await guarded(() => store.insertVariants(id, rows.variants));
    if (created && store.recordImport) {
      // De mejor esfuerzo: el borrador ya existe; un fallo del historial solo se registra.
      try {
        await store.recordImport({
          productId: id,
          supplier,
          supplierProductId: input.supplierProductId,
          actor: auth.email,
          price,
          forced,
          marginPct: check.breakdown.netMarginPct,
        });
      } catch {
        console.error("[admin import] import event failed");
      }
    }
    return {
      ok: true,
      data: {
        created,
        persisted: created,
        simulated: false,
        productId: id,
        status: "draft",
        forced: created && forced,
        check: checkDTO,
      },
    };
  } catch (e) {
    return { ok: false, code: errorCode(e) };
  }
}

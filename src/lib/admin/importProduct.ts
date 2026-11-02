import "server-only";
import { resolveAdmin, type AdminDecision } from "@/lib/auth/requireAdmin";
import { DEFAULT_FX_BUFFER_PCT, fxSource, usdToEur, usdToEurCost, type FxQuote } from "@/lib/pricing/fx";
import { evaluateMarginGuard, minimumPrice, worstCaseCost, type MarginCheck } from "@/lib/pricing/guard";
import type { MarginParams } from "@/lib/pricing/margin";
import { marginSettings } from "@/lib/pricing/settings";
import { isSupplierError } from "@/lib/suppliers/errors";
import { EU_COUNTRY_CODES } from "@/lib/suppliers/eu";
import { getSupplierAdapter, isSimulatedImport } from "@/lib/suppliers/registry";
import type { SupplierAdapter, SupplierId, SupplierProduct } from "@/lib/suppliers/types";
import {
  isStoreCategory,
  type ImportErrorCode,
  type ImportFxDTO,
  type ImportPreviewDTO,
  type ImportShippingDTO,
  type ImportResultDTO,
  type MarginCheckDTO,
  type StoreCategory,
} from "./import.types";

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

export interface ProductRow {
  supplier: SupplierId;
  supplier_product_id: string;
  title: string;
  description: string | null;
  /** Siempre EUR: el coste que usa la guarda. */
  price_cost: number;
  /** Moneda del coste original del proveedor. */
  cost_currency: string;
  cost_original: number;
  fx_rate: number | null;
  fx_rate_date: string | null;
  fx_buffer_pct: number | null;
  /** Flete real en EUR, si el proveedor lo calcula. */
  shipping_estimate: number | null;
  shipping_method: string | null;
  delivery_min_days?: number;
  delivery_max_days?: number;
  supplier_product_type: string | null;
  supplier_seller_id: string | null;
  supplier_seller_name: string | null;
  price_retail: number;
  currency: "EUR";
  images: string[];
  inventory: number;
  category: string | null;
  weight: number | null;
  warehouse: string;
  status: "draft";
}

export interface VariantRow {
  supplier: SupplierId;
  supplier_variant_id: string;
  sku: string;
  name: string;
  /** Siempre EUR. */
  price_cost: number;
  cost_original: number;
  price_retail: number;
  inventory: number;
  attributes: Record<string, string>;
  image: string | null;
}

export type ProductStatus = "draft" | "active" | "archived";

/** Almacén de productos: Supabase (service role) en real, en memoria en tests, nulo con el mock. */
export interface ProductStore {
  findProduct(supplier: SupplierId, supplierProductId: string): Promise<{ id: string; status: ProductStatus } | null>;
  /** Inserta si no existe (ignoreDuplicates): NUNCA pisa una fila existente. */
  insertProduct(row: ProductRow): Promise<{ id: string; created: boolean }>;
  /** Inserta las que falten (ignoreDuplicates); no toca las existentes. */
  insertVariants(productId: string, rows: VariantRow[]): Promise<void>;
}

type ProductCache = Map<string, { at: number; product: SupplierProduct }>;

export interface ImportDeps {
  resolve?: () => Promise<AdminDecision>;
  getAdapter?: () => SupplierAdapter;
  getParams?: () => Promise<MarginParams>;
  getFx?: () => Promise<FxQuote>;
  store?: ProductStore;
  isMock?: () => boolean;
  now?: () => number;
  cache?: ProductCache;
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

/** Texto plano de la descripción del proveedor (HTML): sin etiquetas, scripts ni estilos. */
export function htmlToPlainText(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 5_000) : null;
}

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

interface Assessment {
  warehouse: string;
  euStock: number;
  /** Coste de referencia de la guarda, en EUR: el más alto entre producto y variantes. */
  guardCost: number;
  /** Coste más bajo entre producto y variantes, en EUR (para mostrar el rango). */
  minCost: number;
  /** Coste original de la variante más cara. */
  worstOriginal: number;
  /** Cómo se pasa un coste original a EUR. */
  toEur: (amount: number) => number;
  /** Tipo aplicado (null si el proveedor cobra en EUR). */
  fx: { rate: number; rateDate: string; bufferPct: number; stale: boolean; ageDays: number } | null;
  /** Flete real (null: la guarda usa el envío medio de los ajustes). */
  shipping: ImportShippingDTO | null;
}

/** La tienda es Spain-first: el flete se calcula hasta España. */
const SHIPPING_DESTINATION = "ES";

/** Monedas que se saben convertir (además de EUR). */
const CONVERTIBLE = new Set(["USD"]);

/**
 * Elegibilidad para importar: una sola moneda (EUR o convertible) y almacén UE
 * EXPLÍCITO con stock. El stock se mira primero: sin él no hace falta el tipo.
 */
async function assess(
  product: SupplierProduct,
  params: MarginParams,
  deps: ImportDeps
): Promise<{ ok: true; value: Assessment } | { ok: false; code: ImportErrorCode }> {
  const currency = product.cost.currency;
  const currencies = [currency, ...product.variants.map((v) => v.cost.currency)];
  if (currencies.some((c) => c !== currency) || (currency !== "EUR" && !CONVERTIBLE.has(currency))) {
    return { ok: false, code: "currency_mismatch" };
  }

  const eligible = product.stock.eu.filter(
    (e) => e.warehouse !== null && EU_COUNTRY_CODES.has(e.warehouse) && e.quantity > 0
  );
  if (eligible.length === 0) return { ok: false, code: "not_eu_eligible" };

  let best = eligible[0];
  for (const e of eligible) if (e.quantity > best.quantity) best = e;

  let warehouse = best.warehouse as string;
  let euStock = eligible.reduce((n, e) => n + e.quantity, 0);
  let toEur = (amount: number) => amount;
  let fx: Assessment["fx"] = null;
  if (currency !== "EUR") {
    const quote = await (deps.getFx ?? (() => fxSource().get()))();
    if (!quote.ok) return { ok: false, code: "fx_unavailable" };
    const bufferPct = params.fxBufferPct ?? DEFAULT_FX_BUFFER_PCT;
    toEur = (amount) => usdToEurCost(amount, quote.rate, bufferPct);
    fx = { rate: quote.rate, rateDate: quote.rateDate, bufferPct, stale: quote.stale, ageDays: quote.ageDays };
  }

  // Flete real, si el proveedor lo calcula: sin ruta a España no se importa, sin
  // caer al envío medio. La ruta manda sobre el almacén y el stock que cuentan.
  let shipping: ImportShippingDTO | null = null;
  const adapter = (deps.getAdapter ?? (() => getSupplierAdapter(product.supplier)))();
  if (adapter.getShippingRoute) {
    const route = await adapter.getShippingRoute(product, SHIPPING_DESTINATION);
    if (!route) return { ok: false, code: "no_shipping_route" };
    if (route.cost.currency !== currency) return { ok: false, code: "currency_mismatch" };
    shipping = { cost: toEur(route.cost.amount), method: route.method, origin: route.origin, minDays: route.minDays, maxDays: route.maxDays };
    warehouse = route.origin;
    euStock = eligible.find((e) => e.warehouse === route.origin)?.quantity ?? 0;
  }

  const variantCosts = product.variants.map((v) => v.cost.amount);
  const validVariantCosts = variantCosts.filter((c) => Number.isFinite(c) && c >= 0);
  const worstOriginal = worstCaseCost(product.cost.amount, variantCosts);

  return {
    ok: true,
    value: {
      warehouse,
      euStock,
      guardCost: toEur(worstOriginal),
      minCost: toEur(Math.min(product.cost.amount, ...validVariantCosts)),
      worstOriginal,
      toEur,
      fx,
      shipping,
    },
  };
}

// ----------------------------------------------------- proveedor (+ caché)

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 200;
const defaultCache: ProductCache = new Map();

async function loadProduct(
  supplier: SupplierId,
  id: string,
  deps: ImportDeps
): Promise<SupplierProduct | null> {
  const cache = deps.cache ?? defaultCache;
  const now = (deps.now ?? Date.now)();
  const key = `${supplier}:${id}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.product;

  const adapter = (deps.getAdapter ?? (() => getSupplierAdapter(supplier)))();
  const product = await adapter.getProduct(id, { lang: "es" });
  if (!product) return null;

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: now, product });
  return product;
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

// ------------------------------------------------------------------ filas

function buildRows(
  product: SupplierProduct,
  a: Assessment,
  price: number,
  category: StoreCategory | null
): { product: ProductRow; variants: VariantRow[] } {
  const base = product.sku ?? product.supplierProductId;
  const variants: VariantRow[] =
    product.variants.length > 0
      ? product.variants.map((v) => ({
          supplier: product.supplier,
          supplier_variant_id: v.supplierVariantId,
          sku: v.sku ?? `${base}-${v.supplierVariantId}`,
          name: v.name,
          price_cost: a.toEur(v.cost.amount),
          cost_original: v.cost.amount,
          price_retail: price,
          inventory: a.shipping && v.euStockByWarehouse ? v.euStockByWarehouse[a.warehouse] ?? 0 : v.stock,
          attributes: v.attributes,
          image: v.image,
        }))
      : [
          // Sin variantes: una por defecto (checkout y order_items siempre necesitan supplier_variant_id).
          {
            supplier: product.supplier,
            supplier_variant_id: product.supplierProductId,
            sku: base,
            name: product.title,
            price_cost: a.toEur(product.cost.amount),
            cost_original: product.cost.amount,
            price_retail: price,
            inventory: a.euStock,
            attributes: {},
            image: product.images[0] ?? null,
          },
        ];

  return {
    product: {
      supplier: product.supplier,
      supplier_product_id: product.supplierProductId,
      title: product.title.trim().slice(0, 200),
      description: htmlToPlainText(product.description),
      price_cost: a.toEur(product.cost.amount),
      cost_currency: product.cost.currency,
      cost_original: product.cost.amount,
      fx_rate: a.fx?.rate ?? null,
      fx_rate_date: a.fx?.rateDate ?? null,
      fx_buffer_pct: a.fx?.bufferPct ?? null,
      shipping_estimate: a.shipping?.cost ?? null,
      shipping_method: a.shipping?.method ?? null,
      ...(a.shipping?.minDays != null ? { delivery_min_days: a.shipping.minDays } : {}),
      ...(a.shipping?.maxDays != null ? { delivery_max_days: a.shipping.maxDays } : {}),
      supplier_product_type: product.origin?.productType ?? null,
      supplier_seller_id: product.origin?.sellerId ?? null,
      supplier_seller_name: product.origin?.sellerName ?? null,
      price_retail: price,
      currency: "EUR",
      images: product.images,
      inventory: a.euStock,
      category,
      weight: product.weightKg,
      warehouse: a.warehouse,
      status: "draft",
    },
    variants,
  };
}

// ---------------------------------------------------------------- sesión

async function authorize(deps: ImportDeps): Promise<ImportErrorCode | null> {
  let decision: AdminDecision;
  try {
    decision = await (deps.resolve ?? resolveAdmin)();
  } catch {
    return "unauthenticated";
  }
  return decision.ok ? null : decision.code;
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
  const denied = await authorize(deps);
  if (denied) return { ok: false, code: denied };

  const input = parseInput(rawInput, false);
  if (!input) return { ok: false, code: "invalid_request" };

  try {
    const product = await loadProduct(supplier, input.supplierProductId, deps);
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
  const denied = await authorize(deps);
  if (denied) return { ok: false, code: denied };

  const input = parseInput(rawInput, true);
  if (!input || input.priceRetail === undefined) return { ok: false, code: "invalid_request" };
  const price = input.priceRetail;

  try {
    const product = await loadProduct(supplier, input.supplierProductId, deps);
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

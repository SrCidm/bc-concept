import "server-only";
import { DEFAULT_FX_BUFFER_PCT, fxSource, usdToEurCost, type FxQuote } from "@/lib/pricing/fx";
import { worstCaseCost } from "@/lib/pricing/guard";
import type { MarginParams } from "@/lib/pricing/margin";
import { EU_COUNTRY_CODES } from "@/lib/suppliers/eu";
import { getSupplierAdapter } from "@/lib/suppliers/registry";
import type { SupplierAdapter, SupplierId, SupplierProduct } from "@/lib/suppliers/types";
import type { ImportErrorCode, ImportShippingDTO, StoreCategory } from "./import.types";

/**
 * Lo que se calcula con los datos del proveedor, igual al importar que al
 * publicar: elegibilidad (almacén UE con stock, moneda, flete real a España),
 * coste en EUR con el tipo y el colchón, y las filas de `products` y
 * `product_variants`. Server-only; no lee la sesión ni la BD.
 */

export interface SupplierSnapshotDeps {
  getAdapter?: () => SupplierAdapter;
  getFx?: () => Promise<FxQuote>;
  now?: () => number;
  /** Caché de productos del proveedor (1 min). Publicar pasa una vacía: datos frescos. */
  cache?: ProductCache;
}

export type ProductCache = Map<string, { at: number; product: SupplierProduct }>;

export interface ProductRow {
  supplier: SupplierId;
  supplier_product_id: string;
  /** Título ES público: al importar, el del proveedor como punto de partida. */
  title: string;
  description: string | null;
  /** Texto original del proveedor (INTERNO): publicar exige cambiarlo. */
  supplier_title: string;
  supplier_description: string | null;
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
  /** El mismo flete en la moneda original (para recalcular con el tipo del día). */
  shipping_cost_original: number | null;
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

export interface Assessment {
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
  /** El flete real en la moneda del proveedor. */
  shippingOriginal: number | null;
}

/** La tienda es Spain-first: el flete se calcula hasta España. */
export const SHIPPING_DESTINATION = "ES";

/** Monedas que se saben convertir (además de EUR). */
export const CONVERTIBLE: ReadonlySet<string> = new Set(["USD"]);

/**
 * Elegibilidad: una sola moneda (EUR o convertible) y almacén UE EXPLÍCITO con
 * stock. El stock se mira primero: sin él no hace falta el tipo.
 */
export async function assess(
  product: SupplierProduct,
  params: MarginParams,
  deps: SupplierSnapshotDeps
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
  let shippingOriginal: number | null = null;
  const adapter = (deps.getAdapter ?? (() => getSupplierAdapter(product.supplier)))();
  if (adapter.getShippingRoute) {
    const route = await adapter.getShippingRoute(product, SHIPPING_DESTINATION);
    if (!route) return { ok: false, code: "no_shipping_route" };
    if (route.cost.currency !== currency) return { ok: false, code: "currency_mismatch" };
    shipping = { cost: toEur(route.cost.amount), method: route.method, origin: route.origin, minDays: route.minDays, maxDays: route.maxDays };
    shippingOriginal = route.cost.amount;
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
      shippingOriginal,
    },
  };
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 200;
const defaultCache: ProductCache = new Map();

export async function loadSupplierProduct(
  supplier: SupplierId,
  id: string,
  deps: SupplierSnapshotDeps
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

export function buildRows(
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

  const title = product.title.trim().slice(0, 200);
  const description = htmlToPlainText(product.description);
  return {
    product: {
      supplier: product.supplier,
      supplier_product_id: product.supplierProductId,
      title,
      description,
      supplier_title: title,
      supplier_description: description,
      price_cost: a.toEur(product.cost.amount),
      cost_currency: product.cost.currency,
      cost_original: product.cost.amount,
      fx_rate: a.fx?.rate ?? null,
      fx_rate_date: a.fx?.rateDate ?? null,
      fx_buffer_pct: a.fx?.bufferPct ?? null,
      shipping_estimate: a.shipping?.cost ?? null,
      shipping_cost_original: a.shippingOriginal,
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

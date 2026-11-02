import "server-only";
import { EU_COUNTRY_CODES } from "../eu";
import { list, num, rec, text, type Rec } from "../raw";
import type { Money, ShippingRoute, SupplierProduct, SupplierVariant, WarehouseStock } from "../types";
import { CJ_IMAGE_HOSTS, CJ_LISTED_WAREHOUSES } from "./endpoints";

/**
 * Respuesta de CJ → modelo común. Formas validadas con respuestas reales
 * (`__fixtures__/`). Todo es fail-closed:
 *   · solo cuenta el stock de almacén UE EXPLÍCITO: país desconocido o de fuera = fuera;
 *   · solo `cjInventory` (almacén físico), nunca `factoryInventory`;
 *   · sin precio legible no hay producto (nunca un coste inventado).
 * CJ cobra en USD y solo da textos en inglés.
 */
const CURRENCY = "USD";
const MAX_DESCRIPTION = 5000;

/**
 * Precio de CJ: número, "10.43" o rango "1.80 -- 18.00". En un rango se toma el
 * mayor: la guarda de margen trabaja con el peor caso.
 */
export function parseCjPrice(v: unknown): number | null {
  const direct = typeof v === "number" ? v : null;
  const values = direct !== null ? [direct] : (text(v)?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const valid = values.filter((n) => Number.isFinite(n) && n > 0);
  return valid.length ? Math.max(...valid) : null;
}

const usd = (amount: number): Money => ({ amount, currency: CURRENCY });

/** La descripción de CJ es HTML con imágenes: se guarda solo el texto. */
export function cleanDescription(v: unknown): string | null {
  const raw = text(v);
  if (!raw) return null;
  const plain = raw
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/<[^>]*$/, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "‹")
    .replace(/&gt;/g, "›")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return plain ? plain.slice(0, MAX_DESCRIPTION) : null;
}

function allowedImage(url: unknown): string | null {
  const u = text(url);
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" && CJ_IMAGE_HOSTS.has(parsed.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** `productImage` llega como URL o como lista en forma de texto JSON. */
function imageCandidates(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const t = text(v);
  if (t?.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(t);
      return list(parsed);
    } catch {
      return [];
    }
  }
  return t ? [t] : [];
}

function collectImages(...sources: unknown[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    for (const candidate of imageCandidates(src)) {
      const ok = allowedImage(candidate);
      if (ok) out.add(ok);
    }
  }
  return Array.from(out);
}

const gramsToKg = (v: unknown): number | null => {
  const g = parseCjPrice(v);
  return g === null ? null : Math.round((g / 1000) * 1000) / 1000;
};

function originOf(r: Rec): SupplierProduct["origin"] {
  return { productType: text(r.productType), sellerId: text(r.supplierId), sellerName: text(r.supplierName) };
}

const isEu = (code: string | null): code is string => code !== null && EU_COUNTRY_CODES.has(code.toUpperCase());

/**
 * Producto del listado V1. No trae cantidades: `shippingCountryCodes` indica en
 * qué almacenes está. Solo se admite si incluye un almacén listado de la UE; sin
 * ese dato explícito queda fuera.
 */
export function mapCjListItem(raw: unknown): SupplierProduct | null {
  const r = rec(raw);
  if (!r || r.isTestProduct === true) return null;
  const id = text(r.pid);
  const title = text(r.productNameEn);
  const price = parseCjPrice(r.sellPrice);
  if (!id || !title || price === null) return null;

  const warehouses = list(r.shippingCountryCodes)
    .map((c) => text(c)?.toUpperCase() ?? null)
    .filter((c): c is string => isEu(c) && CJ_LISTED_WAREHOUSES.includes(c));
  if (warehouses.length === 0) return null;

  return {
    supplier: "cj",
    supplierProductId: id,
    sku: text(r.productSku),
    ean: null,
    title,
    description: null,
    images: collectImages(r.productImage),
    category: text(r.categoryName),
    weightKg: gramsToKg(r.productWeight),
    cost: usd(price),
    suggestedRetail: null,
    stock: {
      total: 0,
      eu: warehouses.map((warehouse) => ({ warehouse, quantity: 0, minHandlingDays: null, maxHandlingDays: null })),
      euTotal: 0,
      exact: false,
    },
    delivery: { minDays: null, maxDays: null },
    variants: [],
    origin: originOf(r),
  };
}

/** `variantKey` "Gray-S" + `productKeyEn` "Color-Size" → { Color: "Gray", Size: "S" }. */
function variantAttributes(variantKey: string | null, productKey: string | null): Record<string, string> {
  if (!variantKey || variantKey.toLowerCase() === "default") return {};
  const values = variantKey.split("-").map((s) => s.trim());
  const names = (productKey ?? "").split("-").map((s) => s.trim());
  if (names.length === values.length && names.every(Boolean)) {
    return Object.fromEntries(names.map((name, i) => [name, values[i]]));
  }
  return { variant: variantKey };
}

/** Existencias CJ de una variante por almacén UE explícito. */
function euQuantities(entries: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raw of list(entries)) {
    const e = rec(raw);
    const code = e ? text(e.countryCode)?.toUpperCase() ?? null : null;
    const quantity = e ? num(e.cjInventory) ?? 0 : 0;
    if (isEu(code) && quantity > 0) out[code] = (out[code] ?? 0) + quantity;
  }
  return out;
}

/** Plazo de CJ: "3-5" o "7". */
function parseAging(v: unknown): { minDays: number | null; maxDays: number | null } {
  const match = text(v)?.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return { minDays: null, maxDays: null };
  const min = Number(match[1]);
  return { minDays: min, maxDays: match[2] ? Number(match[2]) : min };
}

/**
 * Rutas de `freightCalculate`, de más barata a más cara. Se toma el mayor entre
 * `logisticPrice` y `totalPostageFee` (este último incluye tasas). Una ruta sin
 * precio, con precio 0 o con error no se usa: CJ devuelve 0 en algunas rutas y no
 * es un coste en el que se pueda confiar.
 */
export function parseCjRoutes(data: unknown, origin: string): ShippingRoute[] {
  const routes: ShippingRoute[] = [];
  for (const raw of list(data)) {
    const r = rec(raw);
    if (!r || text(r.error) || text(r.errorEn)) continue;
    const method = text(r.logisticName);
    const price = parseCjPrice(r.logisticPrice);
    if (!method || price === null) continue;
    const total = parseCjPrice(r.totalPostageFee);
    routes.push({ origin, method, cost: usd(Math.max(price, total ?? 0)), ...parseAging(r.logisticAging) });
  }
  return routes.sort((a, b) => a.cost.amount - b.cost.amount || (a.maxDays ?? Infinity) - (b.maxDays ?? Infinity));
}

/**
 * Detalle (`/product/query`) + inventario (`getInventoryByPid`). Solo quedan las
 * variantes con stock UE: las demás no se pueden servir desde la UE.
 */
export function mapCjProduct(detail: unknown, inventory: unknown): SupplierProduct | null {
  const d = rec(detail);
  if (!d || d.isTestProduct === true) return null;
  const id = text(d.pid);
  const title = text(d.productNameEn);
  if (!id || !title) return null;

  const inv = rec(inventory);
  const stockByVid = new Map<string, Record<string, number>>();
  for (const raw of list(inv?.variantInventories)) {
    const v = rec(raw);
    const vid = v ? text(v.vid) : null;
    if (v && vid) stockByVid.set(vid, euQuantities(v.inventory));
  }

  const productKey = text(d.productKeyEn);
  const rawVariants = list(d.variants).map(rec).filter((v): v is Rec => v !== null);
  const variants: SupplierVariant[] = [];
  for (const v of rawVariants) {
    const vid = text(v.vid);
    const cost = parseCjPrice(v.variantSellPrice);
    const byWarehouse = vid ? stockByVid.get(vid) ?? {} : {};
    const stock = Object.values(byWarehouse).reduce((n, q) => n + q, 0);
    if (!vid || cost === null || stock <= 0) continue;
    const key = text(v.variantKey);
    const suggested = parseCjPrice(v.variantSugSellPrice);
    variants.push({
      supplierVariantId: vid,
      sku: text(v.variantSku),
      name: text(v.variantNameEn) ?? key ?? text(v.variantSku) ?? vid,
      cost: usd(cost),
      suggestedRetail: suggested === null ? null : usd(suggested),
      stock,
      attributes: variantAttributes(key, productKey),
      image: allowedImage(v.variantImage),
      weightKg: gramsToKg(v.variantWeight),
      euStockByWarehouse: byWarehouse,
    });
  }

  const cost = variants.length ? Math.max(...variants.map((v) => v.cost.amount)) : parseCjPrice(d.sellPrice);
  if (cost === null) return null;

  // Si el producto tiene variantes y ninguna se puede servir, no hay stock UE.
  const sellable = rawVariants.length === 0 || variants.length > 0;
  const allStock = list(inv?.inventories).map(rec).filter((e): e is Rec => e !== null);
  const eu: WarehouseStock[] = sellable
    ? allStock
        .filter((e) => isEu(text(e.countryCode)) && (num(e.cjInventoryNum) ?? 0) > 0)
        .map((e) => ({
          warehouse: (text(e.countryCode) as string).toUpperCase(),
          quantity: num(e.cjInventoryNum) ?? 0,
          minHandlingDays: null,
          maxHandlingDays: null,
        }))
    : [];

  const suggested = parseCjPrice(d.suggestSellPrice);
  return {
    supplier: "cj",
    supplierProductId: id,
    sku: text(d.productSku),
    ean: null,
    title,
    description: cleanDescription(d.description),
    images: collectImages(d.bigImage, d.productImageSet),
    category: text(d.categoryName),
    weightKg: gramsToKg(d.productWeight),
    cost: usd(cost),
    suggestedRetail: suggested === null ? null : usd(suggested),
    stock: {
      total: allStock.reduce((n, e) => n + Math.max(num(e.cjInventoryNum) ?? 0, 0), 0),
      eu,
      euTotal: eu.reduce((n, e) => n + e.quantity, 0),
    },
    delivery: { minDays: null, maxDays: null },
    variants,
    origin: originOf(d),
  };
}

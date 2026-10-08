import "server-only";
import type { Money, SupplierProduct, SupplierVariant, WarehouseStock } from "../types";
import { list, num, rec, text, type Rec } from "./raw";
import { filterEuStock, normalizeWarehouse, summarizeHandling } from "./warehouses";

/** BigBuy factura en EUR. */
const CURRENCY = "EUR";

const eur = (amount: number | null): Money | null =>
  amount === null ? null : { amount, currency: CURRENCY };

/** ⚠️ Campos supuestos (a validar): stocks[].{quantity,minHandlingDays,maxHandlingDays,warehouse?}. */
export function mapStock(raw: unknown): WarehouseStock[] {
  const r = rec(raw);
  const entries = r ? list(r.stocks) : list(raw);
  const out: WarehouseStock[] = [];
  for (const e of entries) {
    const s = rec(e);
    if (!s) continue;
    out.push({
      warehouse: normalizeWarehouse(text(s.warehouse) ?? text(s.warehouseCode) ?? text(s.country)),
      quantity: Math.max(0, num(s.quantity) ?? 0),
      minHandlingDays: num(s.minHandlingDays),
      maxHandlingDays: num(s.maxHandlingDays),
    });
  }
  return out;
}

/** Por defecto solo https: la URL acabará en un `<img>` del navegador. */
const httpsOnly = (url: string) => url.startsWith("https://");

/**
 * ⚠️ Supuesto: `{ images: [{ url }] }` o lista de `{ url }` / URLs. Solo https
 * salvo que se inyecte otro filtro (el mock del panel admite rutas locales).
 */
export function mapImages(raw: unknown, allow: (url: string) => boolean = httpsOnly): string[] {
  const r = rec(raw);
  const items = r ? list(r.images) : list(raw);
  const urls: string[] = [];
  for (const item of items) {
    const url = typeof item === "string" ? item : text(rec(item)?.url);
    if (url && allow(url)) urls.push(url);
  }
  return Array.from(new Set(urls));
}

function mapAttributes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const asRecord = rec(raw);
  if (asRecord) {
    for (const [k, v] of Object.entries(asRecord)) {
      const value = text(v);
      if (value) out[k] = value;
    }
    return out;
  }
  for (const item of list(raw)) {
    const a = rec(item);
    const name = a ? text(a.name) ?? text(a.attribute) : null;
    const value = a ? text(a.value) : null;
    if (name && value) out[name] = value;
  }
  return out;
}

/** ⚠️ Supuesto: cada variación trae id, sku, wholesalePrice, retailPrice y stock. */
export function mapVariations(
  raw: unknown,
  allow: (url: string) => boolean = httpsOnly
): SupplierVariant[] {
  const out: SupplierVariant[] = [];
  for (const item of list(raw)) {
    const v = rec(item);
    const id = v ? text(v.id) : null;
    const cost = v ? eur(num(v.wholesalePrice)) : null;
    if (!v || !id || !cost) continue;
    const stockEntries = mapStock(v.stocks ?? null);
    const stock = stockEntries.length
      ? stockEntries.reduce((n, e) => n + e.quantity, 0)
      : Math.max(0, num(v.stock) ?? num(v.quantity) ?? 0);
    out.push({
      supplierVariantId: id,
      sku: text(v.sku),
      name: text(v.name) ?? text(v.sku) ?? id,
      cost,
      suggestedRetail: eur(num(v.retailPrice)),
      stock,
      attributes: mapAttributes(v.attributes),
      image: mapImages(v.images ?? null, allow)[0] ?? null,
    });
  }
  return out;
}

export interface RawBundle {
  product: unknown;
  info?: Rec | null;
  images?: unknown;
  stock?: unknown;
  variations?: unknown;
  /** Filtro de URLs de imagen (por defecto solo https). */
  isAllowedImageUrl?: (url: string) => boolean;
}

/**
 * Une las piezas de BigBuy en un SupplierProduct normalizado. Devuelve null si
 * falta lo imprescindible (id o precio mayorista): un producto sin coste no
 * puede evaluarse, así que no se ofrece.
 */
export function mapProduct(bundle: RawBundle): SupplierProduct | null {
  const p = rec(bundle.product);
  if (!p) return null;
  const id = text(p.id);
  const cost = eur(num(p.wholesalePrice));
  if (!id || !cost) return null;

  const allStock = mapStock(bundle.stock ?? null);
  const eu = filterEuStock(allStock);
  const sku = text(p.sku);

  return {
    supplier: "bigbuy",
    supplierProductId: id,
    sku,
    ean: text(p.ean13) ?? text(p.ean),
    title: text(bundle.info?.name) ?? sku ?? `BigBuy ${id}`,
    description: text(bundle.info?.description),
    images: mapImages(bundle.images ?? null, bundle.isAllowedImageUrl),
    category: text(p.category) ?? text(p.taxonomy),
    weightKg: num(p.weight),
    cost,
    suggestedRetail: eur(num(p.retailPrice)),
    stock: {
      total: allStock.reduce((n, e) => n + e.quantity, 0),
      eu,
      euTotal: eu.reduce((n, e) => n + e.quantity, 0),
    },
    delivery: summarizeHandling(eu),
    variants: mapVariations(bundle.variations ?? null, bundle.isAllowedImageUrl),
  };
}

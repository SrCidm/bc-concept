/**
 * Categorías de la tienda: ÚNICA lista cerrada. La usan el storefront (filtro
 * `?cat=` de la colección, home) y el admin (importación, vía reexport en
 * `lib/admin/import.types.ts`). Módulo puro y client-safe (sin imports).
 */
export const STORE_CATEGORIES = ["lighting", "textiles", "decor"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export function isStoreCategory(v: unknown): v is StoreCategory {
  return typeof v === "string" && (STORE_CATEGORIES as readonly string[]).includes(v);
}

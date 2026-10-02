import { createClient } from "@/lib/supabase/server";
import type { ProductPublic, ProductPublicRow } from "@/types/product";

/** Lista explícita: nunca `select("*")` (regla #1). */
const PUBLIC_COLUMNS =
  "id, slug, title, description, price_retail, currency, images, category, inventory, warehouse, delivery_min_days, delivery_max_days, created_at";

const PAGE_SIZE = 24;
export const MAX_QUERY_LENGTH = 80;

export type CatalogResult =
  | { ok: true; products: ProductPublic[] }
  | { ok: false };

function parseImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.startsWith("http")
  );
}

function toProduct(row: ProductPublicRow): ProductPublic {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    price_retail: Number(row.price_retail),
    currency: row.currency,
    images: parseImages(row.images),
    category: row.category,
    inventory: row.inventory ?? 0,
    warehouse: row.warehouse,
    delivery_min_days: row.delivery_min_days ?? 3,
    delivery_max_days: row.delivery_max_days ?? 7,
    created_at: row.created_at,
  };
}

export function normalizeQuery(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * Catálogo público. Server-only. Con `q` usa la RPC (pg_trgm + unaccent);
 * sin `q` lee la vista `products_public`. Errores internos no se propagan (regla #8).
 */
export async function getCatalogProducts(q: string): Promise<CatalogResult> {
  try {
    const supabase = createClient();

    if (q.length > 0) {
      const { data, error } = await supabase
        .rpc("search_products_public", { q, max_rows: PAGE_SIZE });
      if (error) {
        console.error("[catalog] search failed:", error.code);
        return { ok: false };
      }
      const rows = (data ?? []) as ProductPublicRow[];
      return { ok: true, products: rows.map(toProduct) };
    }

    const { data, error } = await supabase
      .from("products_public")
      .select(PUBLIC_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<ProductPublicRow[]>();
    if (error) {
      console.error("[catalog] list failed:", error.code);
      return { ok: false };
    }
    return { ok: true, products: (data ?? []).map(toProduct) };
  } catch {
    console.error("[catalog] unexpected failure");
    return { ok: false };
  }
}

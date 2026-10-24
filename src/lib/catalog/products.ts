import { createClient } from "@/lib/supabase/server";
import type { ProductPublic, ProductPublicRow } from "@/types/product";
import { PAGE_SIZE, type CatalogParams } from "./params";

/** Lista explícita: nunca `select("*")` (regla #1). */
const PUBLIC_COLUMNS =
  "id, slug, title, description, price_retail, currency, images, category, inventory, warehouse, delivery_min_days, delivery_max_days, created_at";

/** Tope de la RPC de búsqueda (LIMIT 48 en SQL): q + cat + página trabajan dentro de él. */
const SEARCH_MAX_ROWS = 48;

export type CatalogResult =
  | { ok: true; products: ProductPublic[]; page: number; totalPages: number; total: number }
  | { ok: false };

type Client = ReturnType<typeof createClient>;

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

/**
 * Catálogo público. Server-only. Con `q` usa la RPC (pg_trgm + unaccent; como
 * mucho los 48 mejores resultados); sin `q` lee la vista `products_public`.
 * `cat` (ya validada) filtra por categoría y `page` pagina de PAGE_SIZE en
 * PAGE_SIZE, ambas sobre la misma consulta. Errores internos no se propagan
 * (regla #8). `deps.client` permite testear sin red.
 */
export async function getCatalogProducts(
  { q, cat, page }: CatalogParams,
  deps: { client?: () => Client } = {},
): Promise<CatalogResult> {
  try {
    const supabase = (deps.client ?? createClient)();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const base =
      q.length > 0
        ? supabase.rpc("search_products_public", { q, max_rows: SEARCH_MAX_ROWS }, { count: "exact" })
        : supabase.from("products_public").select(PUBLIC_COLUMNS, { count: "exact" }).order("created_at", { ascending: false });
    const filtered = cat ? base.eq("category", cat) : base;
    const { data, error, count } = await filtered.range(from, to);
    // La vista y la RPC devuelven filas de products_public (columnas públicas).
    const rows = (data ?? []) as unknown as ProductPublicRow[];

    if (error) {
      // Página fuera de rango: PostgREST responde 416 (PGRST103). No es un fallo.
      if (error.code === "PGRST103") return { ok: true, products: [], page, totalPages: 0, total: 0 };
      console.error(q ? "[catalog] search failed:" : "[catalog] list failed:", error.code);
      return { ok: false };
    }
    const total = count ?? rows.length;
    return {
      ok: true,
      products: rows.map(toProduct),
      page,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  } catch {
    console.error("[catalog] unexpected failure");
    return { ok: false };
  }
}

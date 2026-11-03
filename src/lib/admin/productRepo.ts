import "server-only";
import type { SupplierId } from "@/lib/suppliers/types";
import type { ProductEventAction, ProductStatus } from "./products.types";

/**
 * Acceso a `products` y `product_events` para el panel, con service role. Solo
 * lo usan `products.ts` y `publishProduct.ts`, que exigen la sesión antes. Las
 * escrituras van por las funciones `admin_*` (cambio + evento en una transacción).
 * Errores: siempre `RepoError` con un código fijo, nunca el texto de la BD.
 */

export type RepoErrorCode = "not_found" | "not_draft" | "not_active" | "stale" | "slug_taken" | "invalid" | "storage_failed";

export class RepoError extends Error {
  constructor(readonly code: RepoErrorCode) {
    super(code);
    this.name = "RepoError";
  }
}

export interface ProductDbRow {
  id: string;
  supplier: SupplierId;
  supplier_product_id: string;
  status: ProductStatus;
  title: string;
  description: string | null;
  title_en: string | null;
  description_en: string | null;
  supplier_title: string | null;
  supplier_description: string | null;
  slug: string | null;
  slug_en: string | null;
  category: string | null;
  images: unknown;
  price_retail: number | string;
  price_cost: number | string;
  cost_currency: string;
  cost_original: number | string | null;
  fx_rate: number | string | null;
  fx_rate_date: string | null;
  shipping_estimate: number | string | null;
  shipping_cost_original: number | string | null;
  shipping_method: string | null;
  delivery_min_days: number | null;
  delivery_max_days: number | null;
  warehouse: string | null;
  inventory: number | null;
  sample_verified_at: string | null;
  sample_verified_by: string | null;
  sample_verified_notes: string | null;
  published_at: string | null;
  updated_at: string;
  product_variants?: { cost_original: number | string | null; price_cost: number | string }[];
}

export interface ProductEventRow {
  id: number;
  action: ProductEventAction;
  actor: string;
  created_at: string;
  status_before: string | null;
  status_after: string | null;
  price_before: number | string | null;
  price_after: number | string | null;
  details: unknown;
}

export interface ProductListFilter {
  status: ProductStatus | null;
  supplier: SupplierId | null;
  page: number;
  pageSize: number;
}

export interface SaveFields {
  title: string;
  description: string | null;
  titleEn: string | null;
  descriptionEn: string | null;
  category: string | null;
  priceRetail: number;
}

export interface PublishSnapshot {
  price_cost: number;
  cost_original: number;
  fx_rate: number | null;
  fx_rate_date: string | null;
  fx_buffer_pct: number | null;
  shipping_estimate: number;
  shipping_cost_original: number | null;
  shipping_method: string;
  inventory: number;
  warehouse: string;
  delivery_min_days: number;
  delivery_max_days: number;
  variants: { supplier_variant_id: string; price_cost: number; cost_original: number; inventory: number }[];
}

export interface ProductRepo {
  list(filter: ProductListFilter): Promise<{ rows: ProductDbRow[]; total: number }>;
  get(id: string): Promise<ProductDbRow | null>;
  events(id: string): Promise<ProductEventRow[]>;
  /** Slugs ya usados en esa columna que empiezan por `base`. */
  takenSlugs(column: "slug" | "slug_en", base: string): Promise<Set<string>>;
  save(id: string, actor: string, fields: SaveFields): Promise<void>;
  setSample(id: string, actor: string, verified: boolean, notes: string | null): Promise<void>;
  publish(
    id: string,
    actor: string,
    expectedPrice: number,
    slugs: { slug: string; slugEn: string },
    snapshot: PublishSnapshot,
    details: Record<string, unknown>
  ): Promise<{ slug: string; slugEn: string }>;
  unpublish(id: string, actor: string): Promise<void>;
  discard(id: string, actor: string): Promise<void>;
}

export const PRODUCT_COLUMNS =
  "id, supplier, supplier_product_id, status, title, description, title_en, description_en, supplier_title, supplier_description, " +
  "slug, slug_en, category, images, price_retail, price_cost, cost_currency, cost_original, fx_rate, fx_rate_date, " +
  "shipping_estimate, shipping_cost_original, shipping_method, delivery_min_days, delivery_max_days, warehouse, inventory, " +
  "sample_verified_at, sample_verified_by, sample_verified_notes, published_at, updated_at, product_variants(cost_original, price_cost)";

const BC_CODES: ReadonlySet<string> = new Set(["not_found", "not_draft", "not_active", "stale"]);

/** Error de PostgREST/Postgres → código fijo. El mensaje solo se mira para los `bc:<código>` propios. */
export function repoErrorFrom(error: { code?: string; message?: string } | null | undefined, where: string): RepoError {
  const bc = /^bc:([a-z_]+)$/.exec(error?.message ?? "")?.[1];
  if (bc && BC_CODES.has(bc)) return new RepoError(bc as RepoErrorCode);
  if (error?.code === "23505") return new RepoError("slug_taken");
  if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22023") return new RepoError("invalid");
  console.error(`[admin products] ${where} failed:`, error?.code ?? "unknown");
  return new RepoError("storage_failed");
}

async function db() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin;
}

export const supabaseProductRepo: ProductRepo = {
  async list({ status, supplier, page, pageSize }) {
    const from = (page - 1) * pageSize;
    let q = (await db())
      .from("products")
      .select(PRODUCT_COLUMNS, { count: "exact" })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });
    if (status) q = q.eq("status", status);
    if (supplier) q = q.eq("supplier", supplier);
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) {
      if (error.code === "PGRST103") return { rows: [], total: count ?? 0 };
      throw repoErrorFrom(error, "list");
    }
    return { rows: (data ?? []) as unknown as ProductDbRow[], total: count ?? 0 };
  },

  async get(id) {
    const { data, error } = await (await db()).from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw repoErrorFrom(error, "get");
    return (data as unknown as ProductDbRow | null) ?? null;
  },

  async events(id) {
    const { data, error } = await (await db())
      .from("product_events")
      .select("id, action, actor, created_at, status_before, status_after, price_before, price_after, details")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw repoErrorFrom(error, "events");
    return (data ?? []) as ProductEventRow[];
  },

  async takenSlugs(column, base) {
    const { data, error } = await (await db()).from("products").select(column).like(column, `${base}%`).limit(1000);
    if (error) throw repoErrorFrom(error, "slugs");
    const out = new Set<string>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const v = row[column];
      if (typeof v === "string") out.add(v);
    }
    return out;
  },

  async save(id, actor, f) {
    const { error } = await (await db()).rpc("admin_save_product", {
      p_id: id,
      p_actor: actor,
      p_title: f.title,
      p_description: f.description,
      p_title_en: f.titleEn,
      p_description_en: f.descriptionEn,
      p_category: f.category,
      p_price: f.priceRetail,
    });
    if (error) throw repoErrorFrom(error, "save");
  },

  async setSample(id, actor, verified, notes) {
    const { error } = await (await db()).rpc("admin_set_sample", { p_id: id, p_actor: actor, p_verified: verified, p_notes: notes });
    if (error) throw repoErrorFrom(error, "sample");
  },

  async publish(id, actor, expectedPrice, slugs, snapshot, details) {
    const { data, error } = await (await db()).rpc("admin_publish_product", {
      p_id: id,
      p_actor: actor,
      p_expected_price: expectedPrice,
      p_slug: slugs.slug,
      p_slug_en: slugs.slugEn,
      p_snapshot: snapshot,
      p_details: details,
    });
    if (error) throw repoErrorFrom(error, "publish");
    const out = data as { slug?: unknown; slug_en?: unknown } | null;
    if (typeof out?.slug !== "string" || typeof out?.slug_en !== "string") throw new RepoError("storage_failed");
    return { slug: out.slug, slugEn: out.slug_en };
  },

  async unpublish(id, actor) {
    const { error } = await (await db()).rpc("admin_unpublish_product", { p_id: id, p_actor: actor });
    if (error) throw repoErrorFrom(error, "unpublish");
  },

  async discard(id, actor) {
    const { error } = await (await db()).rpc("admin_discard_product", { p_id: id, p_actor: actor });
    if (error) throw repoErrorFrom(error, "discard");
  },
};

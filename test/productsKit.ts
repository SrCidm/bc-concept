import type { AdminDecision } from "@/lib/auth/requireAdmin";
import { RepoError, type ProductDbRow, type ProductEventRow, type ProductRepo, type PublishSnapshot, type SaveFields } from "@/lib/admin/productRepo";

/**
 * Repositorio en memoria con la MISMA semántica que las funciones admin_* de la
 * BD (estado, PVP esperado, slugs únicos, descartar solo borradores). Solo tests.
 */

export const ADMIN: AdminDecision = { ok: true, userId: "u1", email: "yosra@bc.com" };
export const NO_SESSION: AdminDecision = { ok: false, status: 401, code: "unauthenticated", message: "x", email: null };
export const ID = "6f1c2a9e-1b2c-4d3e-8f90-a1b2c3d4e5f6";

export function draftRow(over: Partial<ProductDbRow> = {}): ProductDbRow {
  return {
    id: ID,
    supplier: "cj",
    supplier_product_id: "2116011979176017921",
    status: "draft",
    title: "Cojín pompones terracota 45x45",
    description: "Cojín suave de algodón con pompones.",
    title_en: null,
    description_en: null,
    supplier_title: "Cushion Pom-Pom Terracotta 45x45cm",
    supplier_description: "Soft cushion with pom-poms.",
    slug: null,
    slug_en: null,
    category: "textiles",
    images: ["https://cf.cjdropshipping.com/x.jpg"],
    price_retail: "39.90",
    price_cost: "6.71",
    cost_currency: "USD",
    cost_original: "7.28",
    fx_rate: "0.89509",
    fx_rate_date: "2026-10-30",
    shipping_estimate: "9.15",
    shipping_cost_original: "9.92",
    shipping_method: "UPS ES to Multi-Region",
    delivery_min_days: 3,
    delivery_max_days: 5,
    warehouse: "ES",
    inventory: 100,
    sample_verified_at: "2026-11-02T10:00:00Z",
    sample_verified_by: "yosra@bc.com",
    sample_verified_notes: "Costuras y color revisados",
    published_at: null,
    updated_at: "2026-11-02T10:00:00Z",
    product_variants: [{ cost_original: "7.28", price_cost: "6.71" }],
    ...over,
  };
}

export interface PublishCall {
  id: string;
  actor: string;
  expectedPrice: number;
  slugs: { slug: string; slugEn: string };
  snapshot: PublishSnapshot;
  details: Record<string, unknown>;
}

export function memoryRepo(rows: ProductDbRow[] = [draftRow()], opts: { takenSlugs?: string[]; failPublishOnce?: RepoError } = {}) {
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  const events: (ProductEventRow & { product_id: string })[] = [];
  const calls: string[] = [];
  const published: PublishCall[] = [];
  const saved: SaveFields[] = [];
  const taken = new Set(opts.takenSlugs ?? []);
  let failOnce = opts.failPublishOnce ?? null;

  const event = (p: ProductDbRow, action: ProductEventRow["action"], actor: string, after: string | null, details: unknown = {}) =>
    events.push({
      id: events.length + 1,
      product_id: p.id,
      action,
      actor,
      created_at: new Date(Date.UTC(2026, 10, 2, 10, events.length)).toISOString(),
      status_before: p.status,
      status_after: after,
      price_before: p.price_retail,
      price_after: p.price_retail,
      details,
    });
  const draft = (id: string) => {
    const p = byId.get(id);
    if (!p) throw new RepoError("not_found");
    if (p.status !== "draft") throw new RepoError("not_draft");
    return p;
  };

  const repo: ProductRepo = {
    async list(f) {
      calls.push("list");
      const all = Array.from(byId.values()).filter((r) => (!f.status || r.status === f.status) && (!f.supplier || r.supplier === f.supplier));
      return { rows: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: all.length };
    },
    async get(id) {
      calls.push("get");
      const p = byId.get(id);
      return p ? { ...p } : null;
    },
    async events(id) {
      calls.push("events");
      return events.filter((e) => e.product_id === id).reverse();
    },
    async takenSlugs(column, base) {
      calls.push(`takenSlugs:${column}`);
      return new Set(Array.from(taken).filter((s) => s.startsWith(base)));
    },
    async save(id, actor, f) {
      calls.push("save");
      const p = draft(id);
      saved.push(f);
      Object.assign(p, { title: f.title, description: f.description, title_en: f.titleEn, description_en: f.descriptionEn, category: f.category, price_retail: f.priceRetail });
      event(p, "edit", actor, "draft");
    },
    async setSample(id, actor, verified, notes) {
      calls.push("setSample");
      const p = draft(id);
      Object.assign(p, verified
        ? { sample_verified_at: "2026-11-03T09:00:00Z", sample_verified_by: actor, sample_verified_notes: notes }
        : { sample_verified_at: null, sample_verified_by: null, sample_verified_notes: null });
      event(p, verified ? "sample_verified" : "sample_unverified", actor, "draft", verified ? { notes } : {});
    },
    async publish(id, actor, expectedPrice, slugs, snapshot, details) {
      calls.push("publish");
      const p = draft(id);
      if (Number(p.price_retail) !== expectedPrice) throw new RepoError("stale");
      if (failOnce) {
        const e = failOnce;
        failOnce = null;
        taken.add(slugs.slug);
        throw e;
      }
      const slug = p.slug ?? slugs.slug;
      const slugEn = p.slug_en ?? slugs.slugEn;
      if (!p.slug && taken.has(slug)) throw new RepoError("slug_taken");
      published.push({ id, actor, expectedPrice, slugs, snapshot, details });
      event(p, "publish", actor, "active", details);
      Object.assign(p, { status: "active", slug, slug_en: slugEn });
      return { slug, slugEn };
    },
    async unpublish(id, actor) {
      calls.push("unpublish");
      const p = byId.get(id);
      if (!p) throw new RepoError("not_found");
      if (p.status !== "active") throw new RepoError("not_active");
      event(p, "unpublish", actor, "draft");
      p.status = "draft";
    },
    async discard(id, actor) {
      calls.push("discard");
      const p = draft(id);
      event(p, "discard", actor, null);
      byId.delete(id);
    },
  };
  return { repo, calls, events, published, saved, byId };
}

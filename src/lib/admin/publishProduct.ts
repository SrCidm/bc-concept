import "server-only";
import type { AdminDecision } from "@/lib/auth/requireAdmin";
import { fxAgeDays, type FxQuote } from "@/lib/pricing/fx";
import { evaluateMarginGuard } from "@/lib/pricing/guard";
import type { MarginParams } from "@/lib/pricing/margin";
import { marginSettings } from "@/lib/pricing/settings";
import { isSupplierError } from "@/lib/suppliers/errors";
import type { MarginCheckDTO } from "./import.types";
import { supabaseProductRepo, RepoError, type ProductRepo, type PublishSnapshot } from "./productRepo";
import { authorizeAdmin, importedCosts, isProductId, marginAt, productErrorCode, readinessReasons, toCheckDTO, toNum } from "./products";
import type { ProductErrorCode, PublishReason, PublishResultDTO } from "./products.types";
import { slugify, uniqueSlug } from "./slug";
import { assess, buildRows, loadSupplierProduct, type SupplierSnapshotDeps } from "./supplierSnapshot";

/**
 * Publicar un borrador (draft → active). TODO lo comprueba el servidor, en este orden:
 *
 *  1. Sesión de admin y estado `draft`.
 *  2. Con los datos guardados (devuelve todos los motivos a la vez): categoría,
 *     título y descripción ES no vacíos y revisados (distintos del texto del
 *     proveedor), EN revisado si se rellenó, y verificado con muestra.
 *  3. Con datos FRESCOS: se vuelve a pedir el producto al proveedor sin caché.
 *     Stock UE > 0, flete real a España con plazo y, si cobra en otra moneda, el
 *     último tipo publicado con ≤ 4 días (fines de semana y festivos no hay).
 *  4. Guarda de margen al PVP guardado: por debajo del mínimo NO se publica.
 *     Si el margen bajó respecto a la importación, hay que confirmarlo.
 *  5. Slugs ES/EN (solo la primera vez; luego no cambian) y snapshot fresco,
 *     con su evento, en una transacción (`admin_publish_product`).
 *
 * Despublicar (`unpublishProduct`) está en products.ts.
 */

export interface PublishDeps extends Omit<SupplierSnapshotDeps, "cache"> {
  resolve?: () => Promise<AdminDecision>;
  repo?: ProductRepo;
  getParams?: () => Promise<MarginParams>;
  getFx?: () => Promise<FxQuote>;
}

export type PublishResult =
  | { ok: true; data: PublishResultDTO }
  | {
      ok: false;
      code: ProductErrorCode;
      reasons?: PublishReason[];
      check?: MarginCheckDTO;
      marginDrop?: { fromPct: number; toPct: number };
    };

/** Días naturales máximos del último tipo publicado por el BCE. */
export const FX_PUBLISH_MAX_AGE_DAYS = 4;
/** Una bajada menor (redondeos) no cuenta. */
const MARGIN_DROP_TOLERANCE_PCT = 0.05;

export function fxRecentEnough(rateDate: string, now: number): boolean {
  const age = fxAgeDays(rateDate, now);
  return Number.isFinite(age) && age >= 0 && age <= FX_PUBLISH_MAX_AGE_DAYS;
}

async function pickSlugs(
  repo: ProductRepo,
  row: { id: string; title: string; title_en: string | null; slug: string | null; slug_en: string | null }
): Promise<{ slug: string; slugEn: string }> {
  const fallback = `producto-${row.id.slice(0, 8).toLowerCase()}`;
  const make = async (column: "slug" | "slug_en", current: string | null, text: string) => {
    if (current) return current;
    const base = slugify(text);
    return uniqueSlug(base, await repo.takenSlugs(column, base || fallback), fallback);
  };
  return {
    slug: await make("slug", row.slug, row.title),
    slugEn: await make("slug_en", row.slug_en, row.title_en?.trim() || row.title),
  };
}

export async function publishProduct(id: string, raw: unknown, deps: PublishDeps = {}): Promise<PublishResult> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  let confirmMarginDrop = false;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "invalid_request" };
    const c = (raw as Record<string, unknown>).confirmMarginDrop;
    if (c !== undefined && typeof c !== "boolean") return { ok: false, code: "invalid_request" };
    confirmMarginDrop = c === true;
  }

  const repo = deps.repo ?? supabaseProductRepo;
  const now = (deps.now ?? Date.now)();
  try {
    // 1-2) Estado y requisitos con los datos guardados (sin llamar al proveedor).
    const row = await repo.get(id);
    if (!row) return { ok: false, code: "not_found" };
    if (row.status !== "draft") return { ok: false, code: "not_draft" };
    const reasons = readinessReasons(row);
    if (reasons.length > 0) return { ok: false, code: "publish_blocked", reasons };
    const price = toNum(row.price_retail);
    if (price === null) return { ok: false, code: "invalid_request" };

    // 3) Datos frescos: sin la caché de un minuto de la importación.
    const params = await (deps.getParams ?? (() => marginSettings().get()))();
    const fresh = await loadSupplierProduct(row.supplier, row.supplier_product_id, { ...deps, cache: new Map() });
    if (!fresh) return { ok: false, code: "supplier_not_found" };
    const assessed = await assess(fresh, params, deps);
    if (!assessed.ok) return { ok: false, code: assessed.code };
    const a = assessed.value;
    if (!a.shipping) return { ok: false, code: "no_shipping_route" };
    if (a.shipping.minDays === null || a.shipping.maxDays === null) return { ok: false, code: "no_delivery_estimate" };
    if (a.fx && !fxRecentEnough(a.fx.rateDate, now)) return { ok: false, code: "fx_too_old" };

    // 4) Guarda al PVP guardado, sin excepción posible.
    const check = evaluateMarginGuard(a.guardCost, price, params, { shippingCost: a.shipping.cost });
    if (!check) return { ok: false, code: "bad_response" };
    const checkDTO = toCheckDTO(check);
    if (check.belowMin) return { ok: false, code: "margin_below_min", check: checkDTO };

    const imported = importedCosts(row);
    const before = imported ? marginAt(imported, price, params) : null;
    const dropped =
      before !== null && check.breakdown.netMarginPct < before.breakdown.netMarginPct - MARGIN_DROP_TOLERANCE_PCT
        ? { fromPct: before.breakdown.netMarginPct, toPct: check.breakdown.netMarginPct }
        : null;
    if (dropped && !confirmMarginDrop) return { ok: false, code: "margin_dropped", check: checkDTO, marginDrop: dropped };

    // 5) Snapshot fresco con las mismas filas que la importación.
    const rows = buildRows(fresh, a, price, null);
    const p = rows.product;
    const snapshot: PublishSnapshot = {
      price_cost: p.price_cost,
      cost_original: p.cost_original,
      fx_rate: p.fx_rate,
      fx_rate_date: p.fx_rate_date,
      fx_buffer_pct: p.fx_buffer_pct,
      shipping_estimate: a.shipping.cost,
      shipping_cost_original: a.shippingOriginal,
      shipping_method: a.shipping.method,
      inventory: p.inventory,
      warehouse: p.warehouse,
      delivery_min_days: a.shipping.minDays,
      delivery_max_days: a.shipping.maxDays,
      variants: rows.variants.map((v) => ({
        supplier_variant_id: v.supplier_variant_id,
        price_cost: v.price_cost,
        cost_original: v.cost_original,
        inventory: v.inventory,
      })),
    };
    const details = {
      margin_pct: check.breakdown.netMarginPct,
      ...(dropped ? { margin_before_pct: dropped.fromPct, margin_drop_confirmed: true } : {}),
      fx_rate_date: a.fx?.rateDate ?? null,
      route: `${a.shipping.origin} ${a.shipping.method}`,
    };

    let slugs = await pickSlugs(repo, row);
    let published: { slug: string; slugEn: string };
    try {
      published = await repo.publish(id, auth.email, price, slugs, snapshot, details);
    } catch (e) {
      // Otro producto se quedó el slug entre la consulta y la publicación: una vez más.
      if (!(e instanceof RepoError) || e.code !== "slug_taken") throw e;
      slugs = await pickSlugs(repo, row);
      published = await repo.publish(id, auth.email, price, slugs, snapshot, details);
    }
    return { ok: true, data: { slug: published.slug, slugEn: published.slugEn, check: checkDTO, marginDrop: dropped } };
  } catch (e) {
    if (isSupplierError(e)) return { ok: false, code: e.code };
    return { ok: false, code: productErrorCode(e) };
  }
}

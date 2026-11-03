import "server-only";
import { resolveAdmin, type AdminDecision } from "@/lib/auth/requireAdmin";
import { DEFAULT_FX_BUFFER_PCT, fxSource, usdToEurCost, type FxQuote } from "@/lib/pricing/fx";
import { evaluateMarginGuard, worstCaseCost, type MarginCheck } from "@/lib/pricing/guard";
import type { MarginParams } from "@/lib/pricing/margin";
import { marginSettings } from "@/lib/pricing/settings";
import { isStoreCategory, type MarginCheckDTO, type StoreCategory } from "./import.types";
import {
  supabaseProductRepo,
  RepoError,
  type ProductDbRow,
  type ProductEventRow,
  type ProductRepo,
  type RepoErrorCode,
} from "./productRepo";
import {
  PRODUCT_TEXT_LIMITS as L,
  type AdminProductDetailDTO,
  type AdminProductListDTO,
  type AdminProductListItem,
  type MarginTodayDTO,
  type ProductErrorCode,
  type ProductEventDTO,
  type ProductStatus,
  type PublishReason,
} from "./products.types";

/**
 * Revisión de productos en /admin/productos. AUTO-GUARDADO, como
 * `listAdminCatalog`: cada función exige la sesión de admin antes de tocar la
 * BD (service role). Solo se editan, verifican o descartan BORRADORES; un activo
 * es de solo lectura (para cambiarlo se despublica). Publicar está en
 * `publishProduct.ts`, porque vuelve a pedir el producto al proveedor.
 * Errores: solo códigos (regla #8).
 */

export interface ProductsDeps {
  resolve?: () => Promise<AdminDecision>;
  repo?: ProductRepo;
  getParams?: () => Promise<MarginParams>;
  getFx?: () => Promise<FxQuote>;
}

export type ProductsResult<T> = { ok: true; data: T } | { ok: false; code: ProductErrorCode; reasons?: PublishReason[] };

export const ADMIN_PRODUCTS_PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PRICE = 99_999;

// ------------------------------------------------------------- utilidades

export const toNum = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Para comparar con el texto del proveedor: sin espacios sobrantes ni mayúsculas. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isProductId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

export function toCheckDTO(c: MarginCheck): MarginCheckDTO {
  return { ...c.breakdown, minPct: c.minPct, belowMin: c.belowMin, loss: c.loss, minPrice: c.minPrice };
}

/**
 * Lo que falta para publicar, con los datos guardados. Se devuelven TODOS los
 * motivos. Un texto "no revisado" es el del proveedor tal cual (normalizado):
 * en ES siempre se comprueba; en EN, solo si se ha rellenado.
 */
export function readinessReasons(
  p: Pick<
    ProductDbRow,
    "category" | "title" | "description" | "title_en" | "description_en" | "supplier_title" | "supplier_description" | "sample_verified_at"
  >
): PublishReason[] {
  const reasons: PublishReason[] = [];
  const same = (a: string | null, b: string | null) => normalizeText(b) !== "" && normalizeText(a) === normalizeText(b);
  if (!p.category || !isStoreCategory(p.category)) reasons.push("category_missing");
  if (normalizeText(p.title) === "") reasons.push("title_missing");
  else if (same(p.title, p.supplier_title)) reasons.push("title_not_reviewed");
  if (normalizeText(p.description) === "") reasons.push("description_missing");
  else if (same(p.description, p.supplier_description)) reasons.push("description_not_reviewed");
  if (normalizeText(p.title_en) !== "" && same(p.title_en, p.supplier_title)) reasons.push("title_en_not_reviewed");
  if (normalizeText(p.description_en) !== "" && same(p.description_en, p.supplier_description)) reasons.push("description_en_not_reviewed");
  if (!p.sample_verified_at) reasons.push("sample_not_verified");
  return reasons;
}

/** Coste de la guarda y flete en EUR a partir del snapshot guardado. */
export interface SnapshotCosts {
  guardCost: number;
  /** null: sin flete guardado; la guarda usa el envío medio de los ajustes. */
  shipping: number | null;
}

/** Con el tipo de la importación: lo que se guardó en EUR (peor caso entre producto y variantes). */
export function importedCosts(row: ProductDbRow): SnapshotCosts | null {
  const cost = toNum(row.price_cost);
  if (cost === null) return null;
  const variants = (row.product_variants ?? []).map((v) => toNum(v.price_cost)).filter((n): n is number => n !== null);
  return { guardCost: worstCaseCost(cost, variants), shipping: toNum(row.shipping_estimate) };
}

/** Con el tipo y el colchón de HOY sobre el coste y el flete originales. */
export function costsToday(row: ProductDbRow, params: MarginParams, fx: FxQuote | null): SnapshotCosts | "fx_unavailable" | null {
  if (row.cost_currency === "EUR") return importedCosts(row);
  if (row.cost_currency !== "USD") return null;
  if (!fx?.ok) return "fx_unavailable";
  const buffer = params.fxBufferPct ?? DEFAULT_FX_BUFFER_PCT;
  const toEur = (n: number) => usdToEurCost(n, fx.rate, buffer);
  const original = toNum(row.cost_original);
  if (original === null) return importedCosts(row);
  const variants = (row.product_variants ?? []).map((v) => toNum(v.cost_original)).filter((n): n is number => n !== null);
  const shippingOriginal = toNum(row.shipping_cost_original);
  return {
    guardCost: toEur(worstCaseCost(original, variants)),
    shipping: shippingOriginal !== null ? toEur(shippingOriginal) : toNum(row.shipping_estimate),
  };
}

export function marginAt(costs: SnapshotCosts, price: number, params: MarginParams): MarginCheck | null {
  return evaluateMarginGuard(costs.guardCost, price, params, costs.shipping !== null ? { shippingCost: costs.shipping } : {});
}

function marginToday(row: ProductDbRow, price: number, params: MarginParams, fx: FxQuote | null): MarginTodayDTO {
  const costs = costsToday(row, params, fx);
  if (costs === "fx_unavailable") return { check: null, reason: "fx_unavailable", realShipping: toNum(row.shipping_estimate) !== null };
  const check = costs ? marginAt(costs, price, params) : null;
  return { check: check ? toCheckDTO(check) : null, reason: check ? null : "invalid", realShipping: costs?.shipping != null };
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) ? (images.find((i): i is string => typeof i === "string" && i.startsWith("https://")) ?? null) : null;
}

function asStatus(s: string | null): ProductStatus | null {
  return s === "draft" || s === "active" || s === "archived" ? s : null;
}

function toEventDTO(e: ProductEventRow): ProductEventDTO {
  const d = typeof e.details === "object" && e.details !== null && !Array.isArray(e.details) ? (e.details as Record<string, unknown>) : {};
  return {
    id: e.id,
    action: e.action,
    actor: e.actor,
    createdAt: e.created_at,
    statusBefore: asStatus(e.status_before),
    statusAfter: asStatus(e.status_after),
    priceBefore: toNum(e.price_before),
    priceAfter: toNum(e.price_after),
    fields: Array.isArray(d.fields) ? d.fields.filter((f): f is string => typeof f === "string") : [],
    notes: typeof d.notes === "string" ? d.notes : null,
    marginPct: toNum(d.margin_pct),
    marginBeforePct: toNum(d.margin_before_pct),
  };
}

const REPO_TO_CODE: Record<RepoErrorCode, ProductErrorCode> = {
  not_found: "not_found",
  not_draft: "not_draft",
  not_active: "not_active",
  stale: "stale",
  slug_taken: "storage_failed",
  invalid: "invalid_request",
  storage_failed: "storage_failed",
};

export function productErrorCode(e: unknown): ProductErrorCode {
  if (e instanceof RepoError) return REPO_TO_CODE[e.code];
  console.error("[admin products] unexpected error");
  return "storage_failed";
}

/** La sesión primero; devuelve el email (el `actor` del historial). */
export async function authorizeAdmin(deps: { resolve?: () => Promise<AdminDecision> }): Promise<{ ok: true; email: string } | { ok: false; code: ProductErrorCode }> {
  let decision: AdminDecision;
  try {
    decision = await (deps.resolve ?? resolveAdmin)();
  } catch {
    return { ok: false, code: "unauthenticated" };
  }
  return decision.ok ? { ok: true, email: decision.email } : { ok: false, code: decision.code };
}

const params = (deps: ProductsDeps) => (deps.getParams ?? (() => marginSettings().get()))();
const fxIfNeeded = (deps: ProductsDeps, rows: ProductDbRow[]) =>
  rows.some((r) => r.cost_currency !== "EUR") ? (deps.getFx ?? (() => fxSource().get()))() : Promise.resolve(null);

// ------------------------------------------------------------------ listado

export interface AdminProductsQuery {
  status: ProductStatus | null;
  supplier: "cj" | "bigbuy" | null;
  page: number;
}

/** `?status=draft|active&supplier=cj|bigbuy&page=N`; lo que no encaja → null (petición no válida). */
export function parseAdminProductsQuery(sp: Record<string, string | string[] | undefined>): AdminProductsQuery | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v) ?? "";
  const status = one(sp.status);
  const supplier = one(sp.supplier);
  const page = one(sp.page);
  if (status && status !== "draft" && status !== "active") return null;
  if (supplier && supplier !== "cj" && supplier !== "bigbuy") return null;
  if (page && !/^[1-9]\d{0,4}$/.test(page)) return null;
  return {
    status: (status || null) as ProductStatus | null,
    supplier: (supplier || null) as AdminProductsQuery["supplier"],
    page: page ? Number(page) : 1,
  };
}

export async function listAdminProducts(query: AdminProductsQuery, deps: ProductsDeps = {}): Promise<ProductsResult<AdminProductListDTO>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  try {
    const repo = deps.repo ?? supabaseProductRepo;
    const pageSize = ADMIN_PRODUCTS_PAGE_SIZE;
    const { rows, total } = await repo.list({ status: query.status, supplier: query.supplier, page: query.page, pageSize });
    const p = await params(deps);
    const fx = await fxIfNeeded(deps, rows);
    const items: AdminProductListItem[] = rows.map((r) => {
      const price = toNum(r.price_retail) ?? 0;
      return {
        id: r.id,
        supplier: r.supplier,
        image: firstImage(r.images),
        title: r.title,
        costEur: toNum(r.price_cost) ?? 0,
        priceRetail: price,
        margin: marginToday(r, price, p, fx),
        category: r.category && isStoreCategory(r.category) ? r.category : null,
        sampleVerified: r.sample_verified_at !== null,
        status: asStatus(r.status) ?? "draft",
        updatedAt: r.updated_at,
      };
    });
    return { ok: true, data: { items, page: query.page, pageSize, total, hasMore: query.page * pageSize < total } };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

// ------------------------------------------------------------------- ficha

export async function getAdminProduct(id: string, deps: ProductsDeps = {}): Promise<ProductsResult<AdminProductDetailDTO>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  try {
    const repo = deps.repo ?? supabaseProductRepo;
    const row = await repo.get(id);
    if (!row) return { ok: false, code: "not_found" };
    const [events, p] = await Promise.all([repo.events(id), params(deps)]);
    const fx = await fxIfNeeded(deps, [row]);
    const price = toNum(row.price_retail) ?? 0;
    const images = Array.isArray(row.images) ? row.images.filter((i): i is string => typeof i === "string" && i.startsWith("https://")) : [];
    return {
      ok: true,
      data: {
        id: row.id,
        supplier: row.supplier,
        supplierProductId: row.supplier_product_id,
        status: asStatus(row.status) ?? "draft",
        images,
        title: row.title,
        description: row.description,
        titleEn: row.title_en,
        descriptionEn: row.description_en,
        supplierTitle: row.supplier_title,
        supplierDescription: row.supplier_description,
        category: row.category && isStoreCategory(row.category) ? row.category : null,
        priceRetail: price,
        costEur: toNum(row.price_cost) ?? 0,
        costOriginal: toNum(row.cost_original),
        costCurrency: row.cost_currency,
        shippingEstimate: toNum(row.shipping_estimate),
        shippingMethod: row.shipping_method,
        deliveryMinDays: row.delivery_min_days,
        deliveryMaxDays: row.delivery_max_days,
        warehouse: row.warehouse,
        inventory: row.inventory ?? 0,
        sample:
          row.sample_verified_at && row.sample_verified_by && row.sample_verified_notes
            ? { verifiedAt: row.sample_verified_at, verifiedBy: row.sample_verified_by, notes: row.sample_verified_notes }
            : null,
        slug: row.slug,
        slugEn: row.slug_en,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        reasons: readinessReasons(row),
        margin: marginToday(row, price, p, fx),
        events: events.map(toEventDTO),
      },
    };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

// ----------------------------------------------------------------- guardar

interface SaveInput {
  title: string;
  description: string | null;
  titleEn: string | null;
  descriptionEn: string | null;
  category: StoreCategory | null;
  priceRetail: number;
}

/** Texto opcional: recortado, vacío → null; fuera de los límites → undefined (no válido). */
function optionalText(v: unknown, min: number, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t === "") return null;
  return t.length >= min && t.length <= max ? t : undefined;
}

export function validPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0.01 && v <= MAX_PRICE && Math.abs(v * 100 - Math.round(v * 100)) <= 1e-6;
}

/** Valida (no "corrige"). Ignora cualquier campo extra (estado, coste, slugs… nunca vienen del cliente). */
export function parseSaveInput(raw: unknown): SaveInput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const title = optionalText(o.title, L.titleMin, L.titleMax);
  const description = optionalText(o.description, 1, L.descriptionMax);
  const titleEn = optionalText(o.titleEn, L.titleMin, L.titleMax);
  const descriptionEn = optionalText(o.descriptionEn, 1, L.descriptionMax);
  if (!title || description === undefined || titleEn === undefined || descriptionEn === undefined) return null;
  let category: StoreCategory | null = null;
  if (o.category !== undefined && o.category !== null && o.category !== "") {
    if (!isStoreCategory(o.category)) return null;
    category = o.category;
  }
  if (!validPrice(o.priceRetail)) return null;
  return { title, description, titleEn, descriptionEn, category, priceRetail: o.priceRetail };
}

export async function saveAdminProduct(id: string, raw: unknown, deps: ProductsDeps = {}): Promise<ProductsResult<{ reasons: PublishReason[] }>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  const input = parseSaveInput(raw);
  if (!input) return { ok: false, code: "invalid_request" };
  try {
    const repo = deps.repo ?? supabaseProductRepo;
    await repo.save(id, auth.email, input);
    const row = await repo.get(id);
    return { ok: true, data: { reasons: row ? readinessReasons(row) : [] } };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

// ---------------------------------------------- guarda en vivo al editar

export async function previewProductMargin(id: string, raw: unknown, deps: ProductsDeps = {}): Promise<ProductsResult<MarginTodayDTO>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  const price = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).priceRetail : undefined;
  if (!validPrice(price)) return { ok: false, code: "invalid_request" };
  try {
    const row = await (deps.repo ?? supabaseProductRepo).get(id);
    if (!row) return { ok: false, code: "not_found" };
    const p = await params(deps);
    const fx = await fxIfNeeded(deps, [row]);
    return { ok: true, data: marginToday(row, price, p, fx) };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

// ------------------------------------------------------------------ muestra

export async function setSampleVerified(id: string, raw: unknown, deps: ProductsDeps = {}): Promise<ProductsResult<{ reasons: PublishReason[] }>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  if (typeof raw !== "object" || raw === null) return { ok: false, code: "invalid_request" };
  const { verified, notes } = raw as Record<string, unknown>;
  if (typeof verified !== "boolean") return { ok: false, code: "invalid_request" };
  let cleanNotes: string | null = null;
  if (verified) {
    if (typeof notes !== "string") return { ok: false, code: "invalid_request" };
    cleanNotes = notes.trim();
    if (cleanNotes.length < L.sampleNotesMin || cleanNotes.length > L.sampleNotesMax) return { ok: false, code: "invalid_request" };
  }
  try {
    const repo = deps.repo ?? supabaseProductRepo;
    await repo.setSample(id, auth.email, verified, cleanNotes);
    const row = await repo.get(id);
    return { ok: true, data: { reasons: row ? readinessReasons(row) : [] } };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

// ------------------------------------------------- descartar y despublicar

/** Borra un BORRADOR (la BD rechaza un activo). El historial conserva el evento. */
export async function discardDraft(id: string, deps: ProductsDeps = {}): Promise<ProductsResult<{ discarded: true }>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  try {
    await (deps.repo ?? supabaseProductRepo).discard(id, auth.email);
    return { ok: true, data: { discarded: true } };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

/** Vuelve a borrador; los slugs se conservan (URLs estables). */
export async function unpublishProduct(id: string, deps: ProductsDeps = {}): Promise<ProductsResult<{ status: "draft" }>> {
  const auth = await authorizeAdmin(deps);
  if (!auth.ok) return auth;
  if (!isProductId(id)) return { ok: false, code: "not_found" };
  try {
    await (deps.repo ?? supabaseProductRepo).unpublish(id, auth.email);
    return { ok: true, data: { status: "draft" } };
  } catch (e) {
    return { ok: false, code: productErrorCode(e) };
  }
}

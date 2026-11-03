import { describe, expect, test } from "bun:test";
import type { AdminAuth } from "@/lib/auth/requireAdmin";
import { productRoutes, type ProductRouteDeps } from "@/lib/api/productRoutes";
import type { FxQuote } from "@/lib/pricing/fx";
import { DEFAULT_MARGIN_PARAMS } from "@/lib/pricing/settings";
import type { ShippingRoute, SupplierAdapter, SupplierProduct } from "@/lib/suppliers/types";
import { ADMIN, draftRow, ID, memoryRepo, NO_SESSION } from "../../../test/productsKit";

/**
 * Handlers REALES de /api/admin/products/[id]/** creados con la factoría y sus
 * dependencias pasadas directamente: sesión, repositorio en memoria, proveedor y
 * tipo falsos. Sin `mock.module`: no depende del orden de los archivos y nunca
 * toca Supabase ni CJ.
 */

const FRESH: SupplierProduct = {
  supplier: "cj",
  supplierProductId: "2116011979176017921",
  sku: "CJ-POM",
  ean: null,
  title: "Cushion Pom-Pom Terracotta 45x45cm",
  description: "<p>Soft cushion with pom-poms.</p>",
  images: ["https://cf.cjdropshipping.com/x.jpg"],
  category: "Pillows",
  weightKg: 0.4,
  cost: { amount: 7.28, currency: "USD" },
  suggestedRetail: null,
  stock: { total: 80, eu: [{ warehouse: "ES", quantity: 80, minHandlingDays: null, maxHandlingDays: null }], euTotal: 80 },
  delivery: null,
  variants: [],
};
const ROUTE: ShippingRoute = { origin: "ES", method: "UPS ES to Multi-Region", cost: { amount: 9.92, currency: "USD" }, minDays: 3, maxDays: 5 };

const allow: () => Promise<AdminAuth> = async () => ({ ok: true, userId: "u1", email: "yosra@bc.com" });
const deny: () => Promise<AdminAuth> = async () => ({
  ok: false,
  response: new Response(JSON.stringify({ error: { code: "unauthenticated" } }), { status: 401 }),
});

function routes(opts: { session?: boolean; rows?: Parameters<typeof memoryRepo>[0] } = {}) {
  const session = opts.session ?? true;
  const mem = memoryRepo(opts.rows ?? [draftRow()]);
  const adapter: SupplierAdapter = {
    id: "cj",
    auth: async () => ({ ok: true }),
    listProducts: async () => ({ items: [], page: 1, pageSize: 24, hasMore: false, fetched: 0 }),
    getProduct: async () => FRESH,
    getShippingRoute: async () => ROUTE,
  };
  const deps: ProductRouteDeps = {
    requireAdmin: session ? allow : deny,
    resolve: async () => (session ? ADMIN : NO_SESSION),
    repo: mem.repo,
    getAdapter: () => adapter,
    getParams: async () => DEFAULT_MARGIN_PARAMS,
    getFx: async () => ({ ok: true, rate: 0.89509, rateDate: "2026-10-30", ageDays: 1, stale: false }) as FxQuote,
    now: () => Date.parse("2026-10-31T12:00:00Z"),
  };
  return { r: productRoutes(deps), mem };
}

const ctx = (id: string) => ({ params: { id } });
const same = { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" };
const req = (method: string, body?: unknown, headers: Record<string, string> = same) =>
  new Request("http://localhost:3000/x", {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const json = async (r: Response) => (await r.json()) as Record<string, unknown> & { error?: { code?: string; reasons?: string[] } };

describe("la sesión va primero", () => {
  test("sin sesión: 401 en todas, sin tocar el repositorio", async () => {
    const { r, mem } = routes({ session: false });
    const rs = await Promise.all([
      r.item.PATCH(req("PATCH", {}), ctx(ID)),
      r.item.DELETE(req("DELETE"), ctx(ID)),
      r.margin.POST(req("POST", {}), ctx("no-es-uuid")),
      r.sample.POST(req("POST", {}, { "content-type": "application/json" }), ctx(ID)),
      r.publish.POST(req("POST", {}), ctx(ID)),
      r.unpublish.POST(req("POST"), ctx(ID)),
    ]);
    expect(rs.map((x) => x.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(mem.calls).toEqual([]);
  });
});

describe("endurecimiento", () => {
  test("sin Origin del propio sitio: 400 en todas, sin tocar el repositorio", async () => {
    const { r, mem } = routes();
    const noOrigin = { "content-type": "application/json", host: "localhost:3000" };
    const evil = { ...same, origin: "https://evil.example" };
    const rs = await Promise.all([
      r.item.PATCH(req("PATCH", {}, noOrigin), ctx(ID)),
      r.item.DELETE(req("DELETE", undefined, evil), ctx(ID)),
      r.sample.POST(req("POST", { verified: false }, evil), ctx(ID)),
      r.publish.POST(req("POST", {}, noOrigin), ctx(ID)),
      r.unpublish.POST(req("POST", undefined, evil), ctx(ID)),
      r.margin.POST(req("POST", { priceRetail: 10 }, evil), ctx(ID)),
    ]);
    expect(rs.map((x) => x.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(mem.calls).toEqual([]);
  });

  test("id que no es UUID: 404 sin consultar", async () => {
    const { r, mem } = routes();
    for (const res of [
      await r.item.DELETE(req("DELETE"), ctx("../../etc")),
      await r.unpublish.POST(req("POST"), ctx("1 OR 1=1")),
      await r.publish.POST(req("POST", {}), ctx("abc")),
    ]) {
      expect(res.status).toBe(404);
      expect((await json(res)).error?.code).toBe("not_found");
    }
    expect(mem.calls).toEqual([]);
  });

  test("cuerpo no válido: 400 con solo el código y no-store", async () => {
    const { r } = routes();
    const rs = [
      await r.item.PATCH(req("PATCH", { title: "ab", priceRetail: 10 }), ctx(ID)),
      await r.item.PATCH(req("PATCH", "{no json"), ctx(ID)),
      await r.sample.POST(req("POST", { verified: true, notes: "corta" }), ctx(ID)),
      await r.publish.POST(req("POST", { confirmMarginDrop: "sí" }), ctx(ID)),
      await r.margin.POST(req("POST", { priceRetail: 0 }), ctx(ID)),
    ];
    for (const res of rs) {
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(Object.keys(await json(res))).toEqual(["error"]);
    }
  });

  test("límites de tamaño: textos hasta 32 KB al guardar; 4 KB en el resto", async () => {
    const { r, mem } = routes();
    const big = JSON.stringify({ title: "Cojín de lino", description: "x".repeat(5000), descriptionEn: "y".repeat(5000), priceRetail: 39.9 });
    expect((await r.item.PATCH(req("PATCH", big), ctx(ID))).status).toBe(200);
    const huge = JSON.stringify({ title: "Cojín", description: "x".repeat(40_000), priceRetail: 10 });
    expect((await r.item.PATCH(req("PATCH", huge), ctx(ID))).status).toBe(400);
    const notes = JSON.stringify({ verified: true, notes: "x".repeat(5_000) });
    expect((await r.sample.POST(req("POST", notes), ctx(ID))).status).toBe(400);
    expect(mem.calls.filter((c) => c === "save")).toHaveLength(1);
  });
});

describe("flujo completo por HTTP", () => {
  test("guardar → muestra → publicar → despublicar, con su historial", async () => {
    const { r, mem } = routes({ rows: [draftRow({ category: null, sample_verified_at: null, sample_verified_by: null, sample_verified_notes: null })] });
    const blocked = await r.publish.POST(req("POST", {}), ctx(ID));
    expect(blocked.status).toBe(422);
    expect((await json(blocked)).error).toEqual({ code: "publish_blocked", reasons: ["category_missing", "sample_not_verified"] });

    const saved = await r.item.PATCH(req("PATCH", { title: "Cojín pompones terracota", description: "Cojín de algodón.", category: "textiles", priceRetail: 39.9 }), ctx(ID));
    expect(saved.status).toBe(200);
    expect(await json(saved)).toEqual({ reasons: ["sample_not_verified"] });

    const sample = await r.sample.POST(req("POST", { verified: true, notes: "Costuras y color revisados" }), ctx(ID));
    expect(await json(sample)).toEqual({ reasons: [] });

    const published = await r.publish.POST(req("POST", {}), ctx(ID));
    expect(published.status).toBe(200);
    expect(await json(published)).toMatchObject({ slug: "cojin-pompones-terracota", slugEn: "cojin-pompones-terracota", marginDrop: null });

    const editActive = await r.item.PATCH(req("PATCH", { title: "Otro título", priceRetail: 39.9 }), ctx(ID));
    expect(editActive.status).toBe(409);
    expect((await json(editActive)).error?.code).toBe("not_draft");
    const discardActive = await r.item.DELETE(req("DELETE"), ctx(ID));
    expect(discardActive.status).toBe(409);

    expect((await r.unpublish.POST(req("POST"), ctx(ID))).status).toBe(200);
    expect(mem.events.map((e) => e.action)).toEqual(["edit", "sample_verified", "publish", "unpublish"]);
  });

  test("la guarda en vivo y la bajada de margen viajan con sus datos", async () => {
    const { r } = routes({ rows: [draftRow({ price_cost: "5.00", shipping_estimate: "7.00", product_variants: [] })] });
    const live = await r.margin.POST(req("POST", { priceRetail: 19.9 }), ctx(ID));
    expect(live.status).toBe(200);
    expect((await json(live)).check).toMatchObject({ price: 19.9 });

    const dropped = await r.publish.POST(req("POST", {}), ctx(ID));
    expect(dropped.status).toBe(409);
    const body = await json(dropped);
    expect(body.error?.code).toBe("margin_dropped");
    expect(body.marginDrop).toMatchObject({ fromPct: expect.any(Number), toPct: expect.any(Number) });
    expect(body.check).toBeDefined();
    expect((await r.publish.POST(req("POST", { confirmMarginDrop: true }), ctx(ID))).status).toBe(200);
  });

  test("descartar un borrador: 200 y deja el evento", async () => {
    const { r, mem } = routes();
    expect((await r.item.DELETE(req("DELETE"), ctx(ID))).status).toBe(200);
    expect(mem.byId.size).toBe(0);
    expect(mem.events.map((e) => e.action)).toEqual(["discard"]);
  });
});

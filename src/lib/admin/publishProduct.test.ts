import { describe, expect, test } from "bun:test";
import type { FxQuote } from "@/lib/pricing/fx";
import { DEFAULT_MARGIN_PARAMS } from "@/lib/pricing/settings";
import { SupplierError } from "@/lib/suppliers/errors";
import type { ShippingRoute, SupplierAdapter, SupplierProduct } from "@/lib/suppliers/types";
import { RepoError } from "./productRepo";
import { draftRow, ID, memoryRepo, NO_SESSION, ADMIN } from "../../../test/productsKit";
import { FX_PUBLISH_MAX_AGE_DAYS, fxRecentEnough, publishProduct } from "./publishProduct";

const at = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const SATURDAY = at("2026-10-31"); // el BCE publicó el viernes 30

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
  variants: [
    {
      supplierVariantId: "v1",
      sku: "CJ-POM-1",
      name: "Terracotta",
      cost: { amount: 7.28, currency: "USD" },
      suggestedRetail: null,
      stock: 80,
      euStockByWarehouse: { ES: 80 },
      attributes: {},
      image: null,
      weightKg: 0.4,
    },
  ],
};
const ROUTE: ShippingRoute = { origin: "ES", method: "UPS ES to Multi-Region", cost: { amount: 9.92, currency: "USD" }, minDays: 3, maxDays: 5 };

function setup(opts: {
  row?: Parameters<typeof draftRow>[0];
  product?: SupplierProduct | null;
  route?: ShippingRoute | null;
  fx?: FxQuote;
  now?: number;
  takenSlugs?: string[];
  failPublishOnce?: RepoError;
  getProduct?: () => Promise<SupplierProduct | null>;
} = {}) {
  const supplierCalls: string[] = [];
  const mem = memoryRepo([draftRow(opts.row)], { takenSlugs: opts.takenSlugs, failPublishOnce: opts.failPublishOnce });
  const adapter: SupplierAdapter = {
    id: "cj",
    auth: async () => ({ ok: true }),
    listProducts: async () => ({ items: [], page: 1, pageSize: 24, hasMore: false, fetched: 0 }),
    async getProduct() {
      supplierCalls.push("getProduct");
      if (opts.getProduct) return opts.getProduct();
      return opts.product === undefined ? FRESH : opts.product;
    },
    async getShippingRoute() {
      supplierCalls.push("freight");
      return opts.route === undefined ? ROUTE : opts.route;
    },
  };
  const deps = {
    resolve: async () => ADMIN,
    repo: mem.repo,
    getAdapter: () => adapter,
    getParams: async () => DEFAULT_MARGIN_PARAMS,
    getFx: async () => opts.fx ?? ({ ok: true, rate: 0.89509, rateDate: "2026-10-30", ageDays: 1, stale: false } as FxQuote),
    now: () => opts.now ?? SATURDAY,
  };
  return { deps, mem, supplierCalls };
}

describe("tipo de cambio para publicar: el último publicado por el BCE, con ≤ 4 días", () => {
  test("sábado con el tipo del viernes", () => {
    expect(fxRecentEnough("2026-10-30", at("2026-10-31"))).toBe(true);
  });

  test("lunes de Pascua con el tipo del jueves (Viernes Santo tampoco se publica): 4 días", () => {
    expect(fxRecentEnough("2027-03-25", at("2027-03-29"))).toBe(true);
    expect(FX_PUBLISH_MAX_AGE_DAYS).toBe(4);
  });

  test("más de 4 días o fecha futura → no", () => {
    expect(fxRecentEnough("2027-03-25", at("2027-03-30"))).toBe(false);
    expect(fxRecentEnough("2026-11-05", at("2026-11-02"))).toBe(false);
  });

  test("un tipo de respaldo (consulta fallida) de 3 días vale; uno de 5 no publica", async () => {
    const stale = setup({ fx: { ok: true, rate: 0.89509, rateDate: "2026-10-30", ageDays: 3, stale: true }, now: at("2026-11-02") });
    expect((await publishProduct(ID, {}, stale.deps)).ok).toBe(true);
    const old = setup({ fx: { ok: true, rate: 0.89509, rateDate: "2026-10-30", ageDays: 5, stale: true }, now: at("2026-11-04") });
    expect(await publishProduct(ID, {}, old.deps)).toEqual({ ok: false, code: "fx_too_old" });
    expect(old.mem.published).toEqual([]);
  });
});

describe("requisitos con los datos guardados: todos los motivos, sin llamar al proveedor", () => {
  test("recién importado → publish_blocked con cada motivo", async () => {
    const s = setup({
      row: {
        title: "Cushion Pom-Pom Terracotta 45x45cm",
        description: "Soft cushion with pom-poms.",
        title_en: "cushion pom-pom terracotta 45X45CM",
        description_en: " Soft cushion with  pom-poms. ",
        category: null,
        sample_verified_at: null,
        sample_verified_by: null,
        sample_verified_notes: null,
      },
    });
    expect(await publishProduct(ID, {}, s.deps)).toEqual({
      ok: false,
      code: "publish_blocked",
      reasons: [
        "category_missing",
        "title_not_reviewed",
        "description_not_reviewed",
        "title_en_not_reviewed",
        "description_en_not_reviewed",
        "sample_not_verified",
      ],
    });
    expect(s.supplierCalls).toEqual([]);
  });

  test("ya activo → not_draft; sin sesión → nada", async () => {
    const active = setup({ row: { status: "active" } });
    expect(await publishProduct(ID, {}, active.deps)).toEqual({ ok: false, code: "not_draft" });
    const anon = setup();
    expect(await publishProduct(ID, {}, { ...anon.deps, resolve: async () => NO_SESSION })).toEqual({ ok: false, code: "unauthenticated" });
    expect(anon.mem.calls).toEqual([]);
    expect(anon.supplierCalls).toEqual([]);
  });

  test("cuerpo raro → invalid_request", async () => {
    const s = setup();
    expect(await publishProduct(ID, { confirmMarginDrop: "sí" }, s.deps)).toEqual({ ok: false, code: "invalid_request" });
    expect(await publishProduct(ID, [], s.deps)).toEqual({ ok: false, code: "invalid_request" });
  });
});

describe("datos frescos del proveedor", () => {
  test("sin caché: dos publicaciones seguidas vuelven a pedir el producto", async () => {
    const s = setup({ product: null });
    await publishProduct(ID, {}, s.deps);
    await publishProduct(ID, {}, s.deps);
    expect(s.supplierCalls.filter((c) => c === "getProduct")).toHaveLength(2);
  });

  test("ya no existe en el proveedor → supplier_not_found", async () => {
    expect(await publishProduct(ID, {}, setup({ product: null }).deps)).toEqual({ ok: false, code: "supplier_not_found" });
  });

  test("stock UE a 0 → not_eu_eligible", async () => {
    const product = { ...FRESH, stock: { total: 0, eu: [{ warehouse: "ES", quantity: 0, minHandlingDays: null, maxHandlingDays: null }], euTotal: 0 } };
    expect(await publishProduct(ID, {}, setup({ product }).deps)).toEqual({ ok: false, code: "not_eu_eligible" });
  });

  test("sin ruta a España → no_shipping_route; sin plazo → no_delivery_estimate", async () => {
    expect(await publishProduct(ID, {}, setup({ route: null }).deps)).toEqual({ ok: false, code: "no_shipping_route" });
    expect(await publishProduct(ID, {}, setup({ route: { ...ROUTE, minDays: null, maxDays: null } }).deps)).toEqual({
      ok: false,
      code: "no_delivery_estimate",
    });
  });

  test("sin tipo de cambio → fx_unavailable", async () => {
    expect(await publishProduct(ID, {}, setup({ fx: { ok: false } }).deps)).toEqual({ ok: false, code: "fx_unavailable" });
  });

  test("error del proveedor → su código, sin texto", async () => {
    const s = setup({ getProduct: async () => { throw new SupplierError("rate_limited"); } });
    expect(await publishProduct(ID, {}, s.deps)).toEqual({ ok: false, code: "rate_limited" });
  });
});

describe("guarda de margen al PVP guardado", () => {
  test("por debajo del mínimo NO se publica, ni confirmando", async () => {
    const s = setup({ row: { price_retail: "14.90" } });
    const r = await publishProduct(ID, { confirmMarginDrop: true }, s.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("margin_below_min");
    expect(r.check?.belowMin).toBe(true);
    expect(s.mem.published).toEqual([]);
  });

  test("si el margen bajó desde la importación hay que confirmarlo", async () => {
    const product = { ...FRESH, cost: { amount: 9.5, currency: "USD" }, variants: [{ ...FRESH.variants[0], cost: { amount: 9.5, currency: "USD" } }] };
    const s = setup({ product });
    const r = await publishProduct(ID, {}, s.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("margin_dropped");
    expect(r.marginDrop!.toPct).toBeLessThan(r.marginDrop!.fromPct);
    expect(s.mem.published).toEqual([]);

    const ok = await publishProduct(ID, { confirmMarginDrop: true }, s.deps);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.data.marginDrop).toEqual(r.marginDrop!);
    expect(s.mem.published[0].details).toMatchObject({ margin_before_pct: r.marginDrop!.fromPct, margin_drop_confirmed: true });
  });
});

describe("publicar", () => {
  test("snapshot fresco exacto, slugs legibles y evento con el margen", async () => {
    const s = setup({ row: { title_en: "Terracotta pom-pom cushion 45x45" } });
    const r = await publishProduct(ID, {}, s.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ slug: "cojin-pompones-terracota-45x45", slugEn: "terracotta-pom-pom-cushion-45x45", marginDrop: null });
    const call = s.mem.published[0];
    expect(call.actor).toBe("yosra@bc.com");
    expect(call.expectedPrice).toBe(39.9);
    expect(call.snapshot).toEqual({
      price_cost: 6.71, // 7.28 × 0.89509 × 1.03
      cost_original: 7.28,
      fx_rate: 0.89509,
      fx_rate_date: "2026-10-30",
      fx_buffer_pct: 3,
      shipping_estimate: 9.15, // 9.92 × 0.89509 × 1.03
      shipping_cost_original: 9.92,
      shipping_method: "UPS ES to Multi-Region",
      inventory: 80,
      warehouse: "ES",
      delivery_min_days: 3,
      delivery_max_days: 5,
      variants: [{ supplier_variant_id: "v1", price_cost: 6.71, cost_original: 7.28, inventory: 80 }],
    });
    expect(call.details).toMatchObject({ margin_pct: r.data.check.netMarginPct, fx_rate_date: "2026-10-30", route: "ES UPS ES to Multi-Region" });
    expect(s.mem.byId.get(ID)?.status).toBe("active");
  });

  test("sin título EN, el slug EN sale del título ES", async () => {
    const r = await publishProduct(ID, {}, setup().deps);
    expect(r.ok && r.data.slugEn).toBe("cojin-pompones-terracota-45x45");
  });

  test("slug ocupado → sufijo; choque en la propia publicación → un reintento", async () => {
    const taken = setup({ takenSlugs: ["cojin-pompones-terracota-45x45"] });
    const r = await publishProduct(ID, {}, taken.deps);
    expect(r.ok && r.data.slug).toBe("cojin-pompones-terracota-45x45-2");

    const race = setup({ failPublishOnce: new RepoError("slug_taken") });
    const r2 = await publishProduct(ID, {}, race.deps);
    expect(r2.ok && r2.data.slug).toBe("cojin-pompones-terracota-45x45-2");
    expect(race.mem.calls.filter((c) => c === "publish")).toHaveLength(2);
  });

  test("al volver a publicar se conservan los slugs aunque cambie el título (URLs estables)", async () => {
    const s = setup({ row: { title: "Otro título distinto", slug: "cojin-original", slug_en: "original-cushion" } });
    const r = await publishProduct(ID, {}, s.deps);
    expect(r.ok && [r.data.slug, r.data.slugEn]).toEqual(["cojin-original", "original-cushion"]);
    expect(s.mem.calls.some((c) => c.startsWith("takenSlugs"))).toBe(false);
  });

  test("el PVP cambió entre la comprobación y la publicación → stale", async () => {
    const s = setup({ failPublishOnce: new RepoError("stale") });
    expect(await publishProduct(ID, {}, s.deps)).toEqual({ ok: false, code: "stale" });
  });
});

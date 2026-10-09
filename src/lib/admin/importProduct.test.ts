import { describe, expect, test } from "bun:test";
import type { AdminDecision } from "@/lib/auth/requireAdmin";
import { DEFAULT_MARGIN_PARAMS } from "@/lib/pricing/settings";
import { SupplierError } from "@/lib/suppliers/errors";
import type { SupplierAdapter, SupplierProduct, SupplierVariant } from "@/lib/suppliers/types";
import {
  htmlToPlainText,
  importProduct,
  previewImport,
  type ImportDeps,
  type ProductRow,
  type ProductStore,
  type VariantRow,
} from "./importProduct";

/**
 * importProduct / previewImport: lo que ESCRIBE en `products` (draft). Deben
 * exigir la sesión ellos mismos, no fiarse del cliente (coste, almacén, estado),
 * aplicar la guarda de margen, ser idempotentes y NO escribir con el mock.
 */

const ADMIN: AdminDecision = { ok: true, userId: "u1", email: "yosra@bc.com" };
const NO_SESSION: AdminDecision = { ok: false, status: 401, code: "unauthenticated", message: "x", email: null };
const NOT_ADMIN: AdminDecision = { ok: false, status: 403, code: "forbidden", message: "x", email: "intruso@bc.com" };

const variant = (id: string, cost: number, over: Partial<SupplierVariant> = {}): SupplierVariant => ({
  supplierVariantId: id,
  sku: `S1001-${id}`,
  name: `Variante ${id}`,
  cost: { amount: cost, currency: "EUR" },
  suggestedRetail: null,
  stock: 12,
  attributes: { Acabado: "Natural" },
  image: "https://cdn.example/v.jpg",
  ...over,
});

const PRODUCT: SupplierProduct = {
  supplier: "bigbuy",
  supplierProductId: "1001",
  sku: "S1001",
  ean: null,
  title: "Lámpara de mesa de cerámica",
  description: "<p>Lámpara <b>cálida</b> &amp; serena.</p><script>alert(1)</script>",
  images: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
  category: "2501",
  weightKg: 1.8,
  cost: { amount: 18.5, currency: "EUR" },
  suggestedRetail: { amount: 59.9, currency: "EUR" },
  stock: {
    total: 130,
    eu: [
      { warehouse: "DE", quantity: 20, minHandlingDays: 1, maxHandlingDays: 2 },
      { warehouse: "ES", quantity: 90, minHandlingDays: 1, maxHandlingDays: 2 },
    ],
    euTotal: 110,
  },
  delivery: { minDays: 1, maxDays: 2 },
  variants: [variant("a", 18.5), variant("b", 19.5)],
};

/** Almacén en memoria con la MISMA semántica de idempotencia que el real. */
function memoryStore() {
  const calls: string[] = [];
  const products = new Map<string, { id: string; status: "draft" | "active" | "archived"; row: ProductRow }>();
  const variants: Array<VariantRow & { productId: string }> = [];
  const store: ProductStore = {
    async findProduct(supplier, spid) {
      calls.push("find");
      const p = products.get(`${supplier}:${spid}`);
      return p ? { id: p.id, status: p.status } : null;
    },
    async insertProduct(row) {
      calls.push("insertProduct");
      const key = `${row.supplier}:${row.supplier_product_id}`;
      const existing = products.get(key);
      if (existing) return { id: existing.id, created: false }; // ignoreDuplicates: no pisa nada
      const id = `p-${products.size + 1}`;
      products.set(key, { id, status: row.status, row });
      return { id, created: true };
    },
    async insertVariants(productId, rows) {
      calls.push("insertVariants");
      for (const r of rows) {
        if (!variants.some((v) => v.supplier_variant_id === r.supplier_variant_id)) variants.push({ ...r, productId });
      }
    },
  };
  return { store, calls, products, variants };
}

function setup(opts: {
  decision?: AdminDecision | "throw";
  product?: SupplierProduct | null;
  getProduct?: () => Promise<SupplierProduct | null>;
  mock?: boolean;
  store?: ReturnType<typeof memoryStore>;
  now?: () => number;
} = {}) {
  const calls: string[] = [];
  const mem = opts.store ?? memoryStore();
  const adapter: SupplierAdapter = {
    id: "bigbuy",
    async auth() {
      return { ok: true };
    },
    async listProducts() {
      return { items: [], page: 1, pageSize: 24, hasMore: false, fetched: 0 };
    },
    async getProduct() {
      calls.push("adapter.getProduct");
      if (opts.getProduct) return opts.getProduct();
      return opts.product === undefined ? PRODUCT : opts.product;
    },
  };
  const deps: ImportDeps = {
    resolve: async () => {
      calls.push("resolve");
      if (opts.decision === "throw") throw new Error("auth down");
      return opts.decision ?? ADMIN;
    },
    getAdapter: () => {
      calls.push("getAdapter");
      return adapter;
    },
    getParams: async () => DEFAULT_MARGIN_PARAMS,
    store: mem.store,
    isMock: () => opts.mock ?? false,
    cache: new Map(),
    now: opts.now ?? (() => 1_000),
  };
  return { calls, deps, mem };
}

const INPUT = { supplierProductId: "1001", priceRetail: 59.9 };

describe("auto-guardado: sin sesión de admin no se toca ni el proveedor ni la BD", () => {
  for (const [name, fn] of [
    ["previewImport", (d: ImportDeps) => previewImport("bigbuy", { supplierProductId: "1001" }, d)],
    ["importProduct", (d: ImportDeps) => importProduct("bigbuy", INPUT, d)],
  ] as const) {
    test(`${name}: sin sesión → unauthenticated y solo se llama a resolve`, async () => {
      const { calls, deps, mem } = setup({ decision: NO_SESSION });
      expect(await fn(deps)).toEqual({ ok: false, code: "unauthenticated" });
      expect(calls).toEqual(["resolve"]);
      expect(mem.calls).toEqual([]);
    });

    test(`${name}: sesión que no es admin → forbidden`, async () => {
      const { calls, deps, mem } = setup({ decision: NOT_ADMIN });
      expect(await fn(deps)).toEqual({ ok: false, code: "forbidden" });
      expect(calls).toEqual(["resolve"]);
      expect(mem.calls).toEqual([]);
    });

    test(`${name}: si la comprobación de sesión lanza, se deniega (fail-closed)`, async () => {
      const { calls, deps } = setup({ decision: "throw" });
      expect(await fn(deps)).toEqual({ ok: false, code: "unauthenticated" });
      expect(calls).toEqual(["resolve"]);
    });
  }
});

describe("validación de la entrada (no se corrige, se rechaza)", () => {
  const bad: Array<[string, unknown]> = [
    ["id vacío", { supplierProductId: "", priceRetail: 10 }],
    ["id con caracteres raros", { supplierProductId: "../1001", priceRetail: 10 }],
    ["id no string", { supplierProductId: 1001, priceRetail: 10 }],
    ["precio 0", { supplierProductId: "1001", priceRetail: 0 }],
    ["precio negativo", { supplierProductId: "1001", priceRetail: -5 }],
    ["precio NaN", { supplierProductId: "1001", priceRetail: Number.NaN }],
    ["precio como texto", { supplierProductId: "1001", priceRetail: "59.9" }],
    ["precio con 3 decimales", { supplierProductId: "1001", priceRetail: 59.999 }],
    ["precio desorbitado", { supplierProductId: "1001", priceRetail: 1_000_000 }],
    ["categoría fuera de la lista", { supplierProductId: "1001", priceRetail: 10, category: "armas" }],
    ["confirmación no booleana", { supplierProductId: "1001", priceRetail: 10, confirmBelowMargin: "true" }],
    ["body no objeto", null],
  ];

  for (const [name, input] of bad) {
    test(`importProduct rechaza: ${name}`, async () => {
      const { calls, deps, mem } = setup();
      const r = await importProduct("bigbuy", input as never, deps);
      expect(r).toEqual({ ok: false, code: "invalid_request" });
      expect(calls).not.toContain("adapter.getProduct");
      expect(mem.calls).toEqual([]);
    });
  }

  test("previewImport: el precio es opcional pero, si viene, se valida", async () => {
    const ok = setup();
    expect((await previewImport("bigbuy", { supplierProductId: "1001" }, ok.deps)).ok).toBe(true);
    const ko = setup();
    expect(await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: -1 }, ko.deps)).toEqual({
      ok: false,
      code: "invalid_request",
    });
  });

  test("categoría válida o ausente (null/undefined)", async () => {
    for (const category of [undefined, null, "lighting", "textiles", "decor"]) {
      const { deps } = setup();
      const r = await importProduct("bigbuy", { ...INPUT, category } as never, deps);
      expect(r.ok).toBe(true);
    }
  });
});

describe("previewImport", () => {
  test("resumen del producto con coste y almacén UE elegido (el de más stock)", async () => {
    const { deps } = setup();
    const r = await previewImport("bigbuy", { supplierProductId: "1001" }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.product).toMatchObject({
      supplierProductId: "1001",
      title: "Lámpara de mesa de cerámica",
      image: "https://cdn.example/1.jpg",
      cost: { amount: 18.5, currency: "EUR" },
      suggestedRetail: { amount: 59.9, currency: "EUR" },
      variantCount: 2,
      worstCaseCost: 19.5,
      warehouse: "ES",
      euStock: 110,
    });
    expect(r.data.alreadyImported).toBeNull();
    expect(r.data.simulated).toBe(false);
  });

  test("sin precio: parte del recomendado del proveedor y devuelve la guarda a ese precio", async () => {
    const { deps } = setup();
    const r = await previewImport("bigbuy", { supplierProductId: "1001" }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.suggestedPrice).toBe(59.9);
    expect(r.data.check?.price).toBe(59.9);
    expect(r.data.check?.belowMin).toBe(false);
    expect(r.data.check?.minPct).toBe(15);
    expect(r.data.check?.minPrice).toBeGreaterThan(0);
  });

  test("sin recomendado del proveedor: el inicial es el mínimo redondeado hacia arriba a ,90", async () => {
    const { deps } = setup({ product: { ...PRODUCT, suggestedRetail: null } });
    const r = await previewImport("bigbuy", { supplierProductId: "1001" }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    const min = r.data.check!.minPrice!;
    expect(r.data.suggestedPrice).not.toBeNull();
    expect(r.data.suggestedPrice!).toBeGreaterThanOrEqual(min);
    expect(Math.round((r.data.suggestedPrice! % 1) * 100)).toBe(90);
    expect(r.data.check?.belowMin).toBe(false);
  });

  test("con precio: la guarda se recalcula con coste del PEOR caso (variante cara)", async () => {
    const pricey = { ...PRODUCT, variants: [variant("a", 18.5), variant("b", 40)] };
    const { deps } = setup({ product: pricey });
    const r = await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: 59.9 }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.product.worstCaseCost).toBe(40);
    expect(r.data.check?.cost).toBe(40);
    expect(r.data.check?.belowMin).toBe(true);
  });

  test("alreadyImported refleja el estado del producto en la tienda", async () => {
    const mem = memoryStore();
    mem.products.set("bigbuy:1001", { id: "p-1", status: "active", row: {} as ProductRow });
    const { deps } = setup({ store: mem });
    const r = await previewImport("bigbuy", { supplierProductId: "1001" }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.alreadyImported).toEqual({ status: "active" });
  });

  test("no es elegible (sin almacén UE explícito) → not_eu_eligible", async () => {
    const { deps } = setup({ product: { ...PRODUCT, stock: { total: 50, eu: [], euTotal: 0 } } });
    expect(await previewImport("bigbuy", { supplierProductId: "1001" }, deps)).toEqual({
      ok: false,
      code: "not_eu_eligible",
    });
  });

  test("la respuesta del preview sí lleva el coste (solo admin); la del error no lleva nada del proveedor", async () => {
    const ok = setup();
    const r = await previewImport("bigbuy", { supplierProductId: "1001" }, ok.deps);
    expect(JSON.stringify(r)).toContain("18.5");
    const ko = setup({ getProduct: async () => { throw new SupplierError("upstream"); } });
    const e = await previewImport("bigbuy", { supplierProductId: "1001" }, ko.deps);
    expect(e).toEqual({ ok: false, code: "upstream" });
  });
});

describe("caché de producto (el preview con debounce no machaca al proveedor)", () => {
  test("dos previews seguidos → una sola llamada a getProduct; pasado el TTL, otra", async () => {
    let t = 1_000;
    const env = setup({ now: () => t });
    await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: 50 }, env.deps);
    await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: 55 }, env.deps);
    expect(env.calls.filter((c) => c === "adapter.getProduct")).toHaveLength(1);
    t += 61_000;
    await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: 55 }, env.deps);
    expect(env.calls.filter((c) => c === "adapter.getProduct")).toHaveLength(2);
  });

  test("producto inexistente → not_found y no se cachea el fallo", async () => {
    const env = setup({ product: null });
    expect(await previewImport("bigbuy", { supplierProductId: "9999" }, env.deps)).toEqual({ ok: false, code: "not_found" });
  });
});

describe("importProduct: qué se escribe", () => {
  test("crea el producto en DRAFT con los datos del PROVEEDOR y el PVP elegido", async () => {
    const { deps, mem } = setup();
    const r = await importProduct("bigbuy", { ...INPUT, category: "lighting" }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data).toMatchObject({ created: true, persisted: true, simulated: false, status: "draft", forced: false });
    expect(r.data.productId).toBe("p-1");

    const row = mem.products.get("bigbuy:1001")!.row;
    expect(row).toMatchObject({
      supplier: "bigbuy",
      supplier_product_id: "1001",
      title: "Lámpara de mesa de cerámica",
      price_cost: 18.5,
      cost_currency: "EUR",
      price_retail: 59.9,
      currency: "EUR",
      images: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
      inventory: 110,
      category: "lighting",
      weight: 1.8,
      warehouse: "ES",
      status: "draft",
    });
    // Sin slug (se asigna al publicar) ni días de entrega (defaults de BD).
    expect("slug" in row).toBe(false);
    expect("delivery_min_days" in row).toBe(false);
  });

  test("descripción en texto plano: sin etiquetas ni scripts (no hay HTML del proveedor en la BD)", async () => {
    const { deps, mem } = setup();
    await importProduct("bigbuy", INPUT, deps);
    const d = mem.products.get("bigbuy:1001")!.row.description!;
    expect(d).toBe("Lámpara cálida & serena.");
    expect(d).not.toMatch(/<|script|alert/);
  });

  test("variantes: una por variante del proveedor, con su coste, y el PVP del producto", async () => {
    const { deps, mem } = setup();
    await importProduct("bigbuy", INPUT, deps);
    expect(mem.variants).toHaveLength(2);
    expect(mem.variants[0]).toMatchObject({
      productId: "p-1",
      supplier: "bigbuy",
      supplier_variant_id: "a",
      sku: "S1001-a",
      name: "Variante a",
      price_cost: 18.5,
      price_retail: 59.9,
      inventory: 12,
      attributes: { Acabado: "Natural" },
    });
    expect(mem.variants[1]).toMatchObject({ supplier_variant_id: "b", price_cost: 19.5, price_retail: 59.9 });
  });

  test("producto SIN variantes → una variante por defecto (checkout siempre tiene supplier_variant_id)", async () => {
    const { deps, mem } = setup({ product: { ...PRODUCT, variants: [] } });
    await importProduct("bigbuy", INPUT, deps);
    expect(mem.variants).toHaveLength(1);
    expect(mem.variants[0]).toMatchObject({
      supplier_variant_id: "1001",
      sku: "S1001",
      name: "Lámpara de mesa de cerámica",
      price_cost: 18.5,
      price_retail: 59.9,
      inventory: 110,
    });
  });

  test("variante sin sku → sku de respaldo derivado del producto", async () => {
    const { deps, mem } = setup({ product: { ...PRODUCT, variants: [variant("z", 18.5, { sku: null })] } });
    await importProduct("bigbuy", INPUT, deps);
    expect(mem.variants[0].sku).toBe("S1001-z");
  });
});

describe("importProduct: el CLIENTE no manda sobre coste, estado ni almacén", () => {
  test("campos extra del cliente (cost, price_cost, status, warehouse) se ignoran", async () => {
    const { deps, mem } = setup();
    const hostile = {
      ...INPUT,
      cost: 0.01,
      price_cost: 0.01,
      priceCost: 0.01,
      status: "active",
      warehouse: "CN",
      title: "Pwned",
      slug: "mi-slug",
    };
    const r = await importProduct("bigbuy", hostile as never, deps);
    expect(r.ok).toBe(true);
    const row = mem.products.get("bigbuy:1001")!.row;
    expect(row.price_cost).toBe(18.5);
    expect(row.status).toBe("draft");
    expect(row.warehouse).toBe("ES");
    expect(row.title).toBe("Lámpara de mesa de cerámica");
    expect("slug" in row).toBe(false);
  });
});

describe("guarda de margen en el servidor", () => {
  const CHEAP = 30; // por debajo del mínimo con coste 18.5 + variante 19.5

  test("por debajo del mínimo SIN confirmar → margin_below_min con el desglose y 0 escrituras", async () => {
    const { deps, mem } = setup();
    const r = await importProduct("bigbuy", { supplierProductId: "1001", priceRetail: CHEAP }, deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("margin_below_min");
    expect(r.check?.belowMin).toBe(true);
    expect(r.check?.minPrice).toBeGreaterThan(CHEAP);
    expect(mem.calls).toEqual([]);
  });

  test("confirmBelowMargin:false explícito tampoco deja guardar", async () => {
    const { deps, mem } = setup();
    const r = await importProduct("bigbuy", { supplierProductId: "1001", priceRetail: CHEAP, confirmBelowMargin: false }, deps);
    expect(r).toMatchObject({ ok: false, code: "margin_below_min" });
    expect(mem.calls).toEqual([]);
  });

  test("con confirmación explícita se guarda y queda marcado como forced", async () => {
    const { deps, mem } = setup();
    const r = await importProduct("bigbuy", { supplierProductId: "1001", priceRetail: CHEAP, confirmBelowMargin: true }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.forced).toBe(true);
    expect(r.data.check.belowMin).toBe(true);
    expect(mem.products.get("bigbuy:1001")!.row.price_retail).toBe(CHEAP);
  });

  test("margen correcto: confirmar es innecesario y forced es false", async () => {
    const { deps } = setup();
    const r = await importProduct("bigbuy", { ...INPUT, confirmBelowMargin: true }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.forced).toBe(false);
  });

  test("una variante cara hace saltar la guarda aunque el producto base sea rentable", async () => {
    const pricey = { ...PRODUCT, variants: [variant("a", 18.5), variant("b", 40)] };
    const { deps, mem } = setup({ product: pricey });
    const r = await importProduct("bigbuy", INPUT, deps);
    expect(r).toMatchObject({ ok: false, code: "margin_below_min" });
    expect(mem.calls).toEqual([]);
  });
});

describe("solo almacén UE (fail-closed en el import)", () => {
  const stock = (eu: SupplierProduct["stock"]["eu"], total = 100) => ({ total, eu, euTotal: eu.reduce((n, e) => n + e.quantity, 0) });

  test("solo almacén desconocido (null) → not_eu_eligible aunque el listado lo dejara pasar", async () => {
    const { deps, mem } = setup({
      product: { ...PRODUCT, stock: stock([{ warehouse: null, quantity: 30, minHandlingDays: 1, maxHandlingDays: 2 }]) },
    });
    expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code: "not_eu_eligible" });
    expect(mem.calls).toEqual([]);
  });

  test("solo fuera de la UE (lista UE vacía) → not_eu_eligible", async () => {
    const { deps, mem } = setup({ product: { ...PRODUCT, stock: stock([], 80) } });
    expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code: "not_eu_eligible" });
    expect(mem.calls).toEqual([]);
  });

  test("almacén UE con 0 unidades → not_eu_eligible", async () => {
    const { deps } = setup({
      product: { ...PRODUCT, stock: stock([{ warehouse: "ES", quantity: 0, minHandlingDays: 1, maxHandlingDays: 2 }]) },
    });
    expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code: "not_eu_eligible" });
  });

  test("un código de almacén que NO es UE (aunque llegue en la lista) no cuenta", async () => {
    const { deps } = setup({
      product: { ...PRODUCT, stock: stock([{ warehouse: "CN", quantity: 50, minHandlingDays: 6, maxHandlingDays: 9 }]) },
    });
    expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code: "not_eu_eligible" });
  });

  test("mezcla: se elige el almacén UE explícito con más stock e ignora el desconocido", async () => {
    const { deps, mem } = setup({
      product: {
        ...PRODUCT,
        stock: stock([
          { warehouse: null, quantity: 500, minHandlingDays: 1, maxHandlingDays: 2 },
          { warehouse: "PT", quantity: 15, minHandlingDays: 1, maxHandlingDays: 2 },
          { warehouse: "FR", quantity: 40, minHandlingDays: 1, maxHandlingDays: 2 },
        ]),
      },
    });
    await importProduct("bigbuy", INPUT, deps);
    expect(mem.products.get("bigbuy:1001")!.row.warehouse).toBe("FR");
  });
});

describe("moneda", () => {
  test("coste en USD → currency_mismatch, sin escribir", async () => {
    const { deps, mem } = setup({ product: { ...PRODUCT, cost: { amount: 18.5, currency: "USD" } } });
    expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code: "currency_mismatch" });
    expect(mem.calls).toEqual([]);
  });

  test("una variante en otra moneda también bloquea", async () => {
    const odd = variant("b", 19.5, { cost: { amount: 19.5, currency: "GBP" } });
    const { deps, mem } = setup({ product: { ...PRODUCT, variants: [variant("a", 18.5), odd] } });
    expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code: "currency_mismatch" });
    expect(mem.calls).toEqual([]);
  });
});

describe("idempotencia: importar dos veces el mismo supplier_product_id no duplica", () => {
  test("la 2.ª vez devuelve created:false y NO pisa lo ya guardado (ni precio ni título)", async () => {
    const mem = memoryStore();
    const first = setup({ store: mem });
    const r1 = await importProduct("bigbuy", { ...INPUT, priceRetail: 59.9 }, first.deps);
    const second = setup({ store: mem });
    const r2 = await importProduct("bigbuy", { ...INPUT, priceRetail: 79.9, category: "decor" }, second.deps);

    if (!r1.ok || !r2.ok) throw new Error("deberían ir bien");
    expect(r1.data.created).toBe(true);
    expect(r2.data.created).toBe(false);
    expect(r2.data.persisted).toBe(false);
    expect(r2.data.productId).toBe(r1.data.productId);
    expect(mem.products.size).toBe(1);
    expect(mem.products.get("bigbuy:1001")!.row.price_retail).toBe(59.9);
    expect(mem.products.get("bigbuy:1001")!.row.category).toBeNull();
    expect(mem.variants).toHaveLength(2);
  });

  test("conserva el estado actual (p. ej. ya publicado) y no lo baja a draft", async () => {
    const mem = memoryStore();
    mem.products.set("bigbuy:1001", { id: "p-9", status: "active", row: { price_retail: 49 } as ProductRow });
    const { deps } = setup({ store: mem });
    const r = await importProduct("bigbuy", INPUT, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data).toMatchObject({ created: false, productId: "p-9", status: "active" });
    expect(mem.products.get("bigbuy:1001")!.status).toBe("active");
  });

  test("auto-reparación: si un intento anterior dejó el producto sin variantes, el reintento las completa", async () => {
    const mem = memoryStore();
    mem.products.set("bigbuy:1001", { id: "p-1", status: "draft", row: { price_retail: 59.9 } as ProductRow });
    const { deps } = setup({ store: mem });
    const r = await importProduct("bigbuy", INPUT, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.created).toBe(false);
    expect(mem.variants.map((v) => v.supplier_variant_id).sort()).toEqual(["a", "b"]);
    expect(mem.products.size).toBe(1);
  });

  test("dos importaciones simultáneas → un único producto", async () => {
    const mem = memoryStore();
    const [a, b] = await Promise.all([
      importProduct("bigbuy", INPUT, setup({ store: mem }).deps),
      importProduct("bigbuy", INPUT, setup({ store: mem }).deps),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(mem.products.size).toBe(1);
    expect(mem.variants).toHaveLength(2);
  });
});

describe("con el mock activo NO se escribe (simulación)", () => {
  test("0 llamadas al almacén, ni siquiera de lectura, y se declara como simulado", async () => {
    const { deps, mem } = setup({ mock: true });
    const r = await importProduct("bigbuy", INPUT, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data).toMatchObject({ simulated: true, persisted: false, created: false, productId: null, status: "draft" });
    expect(mem.calls).toEqual([]);
  });

  test("tampoco con confirmBelowMargin", async () => {
    const { deps, mem } = setup({ mock: true });
    const r = await importProduct("bigbuy", { supplierProductId: "1001", priceRetail: 30, confirmBelowMargin: true }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.simulated).toBe(true);
    expect(r.data.forced).toBe(true);
    expect(mem.calls).toEqual([]);
  });

  test("la guarda se aplica igual en la simulación (se ve el mismo comportamiento que en real)", async () => {
    const { deps, mem } = setup({ mock: true });
    expect(await importProduct("bigbuy", { supplierProductId: "1001", priceRetail: 30 }, deps)).toMatchObject({
      ok: false,
      code: "margin_below_min",
    });
    expect(mem.calls).toEqual([]);
  });

  test("el preview indica simulated:true y no consulta la BD", async () => {
    const { deps, mem } = setup({ mock: true });
    const r = await previewImport("bigbuy", { supplierProductId: "1001" }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.simulated).toBe(true);
    expect(r.data.alreadyImported).toBeNull();
    expect(mem.calls).toEqual([]);
  });
});

describe("errores: solo códigos (regla #8)", () => {
  test("errores del proveedor → su código", async () => {
    for (const code of ["not_configured", "unauthorized", "rate_limited", "timeout", "upstream", "bad_response"] as const) {
      const { deps } = setup({ getProduct: async () => { throw new SupplierError(code); } });
      expect(await importProduct("bigbuy", INPUT, deps)).toEqual({ ok: false, code });
    }
  });

  test("error inesperado del proveedor → upstream genérico, sin filtrar texto", async () => {
    const { deps } = setup({ getProduct: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5 key=bb_SECRET"); } });
    const r = await importProduct("bigbuy", INPUT, deps);
    expect(r).toEqual({ ok: false, code: "upstream" });
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|SECRET|10\.0\.0\.5/);
  });

  test("fallo al escribir en la BD → storage_failed sin detalles de la BD", async () => {
    const { deps, mem } = setup();
    deps.store = {
      ...mem.store,
      insertProduct: async () => {
        throw new Error('duplicate key value violates unique constraint "products_slug_key" detail: secret');
      },
    };
    const r = await importProduct("bigbuy", INPUT, deps);
    expect(r).toEqual({ ok: false, code: "storage_failed" });
    expect(JSON.stringify(r)).not.toMatch(/duplicate|constraint|secret/);
  });
});

describe("htmlToPlainText", () => {
  test("quita etiquetas, scripts y estilos; decodifica entidades básicas; colapsa espacios", () => {
    expect(htmlToPlainText("<p>Hola&nbsp;<b>mundo</b></p><br/><p>Dos &amp; tres &lt;3</p>")).toBe("Hola mundo Dos & tres <3");
    expect(htmlToPlainText("<style>.a{}</style><script>x()</script>Texto")).toBe("Texto");
    expect(htmlToPlainText("<img src=x onerror=alert(1)>ok")).toBe("ok");
  });

  test("vacío/null → null y se acota la longitud", () => {
    expect(htmlToPlainText(null)).toBeNull();
    expect(htmlToPlainText("<p> </p>")).toBeNull();
    expect(htmlToPlainText("a".repeat(10_000))!.length).toBeLessThanOrEqual(5_000);
  });
});

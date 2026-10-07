import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SupplierError } from "../errors";
import { assertSafeBaseUrl } from "./endpoints";
import { createBigBuyAdapter } from "./index";
import { mapImages, mapProduct, mapStock } from "./mappers";
import { INFO, IMAGES, PRODUCTS, STOCK, VARIATIONS } from "./__fixtures__/bigbuy";
import { isEuWarehouse, summarizeHandling } from "./warehouses";

const KEY = "bb_TEST_KEY_do_not_leak_123456";

/** Ruta → respuesta, para un `fetch` falso (sin red). */
type Routes = Record<string, (url: URL) => Response | unknown>;

function fakeFetch(routes: Routes) {
  const calls: Array<{ path: string; search: string; auth: string | null }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ path: url.pathname, search: url.search, auth: headers.get("authorization") });
    const handler = routes[url.pathname];
    if (!handler) return new Response("{}", { status: 404 });
    const out = handler(url);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const catalogRoutes: Routes = {
  "/rest/catalog/products.json": () => PRODUCTS,
  "/rest/catalog/productsinformation.json": () => INFO,
  "/rest/catalog/productsimages.json": () => IMAGES,
  "/rest/catalog/productsstock.json": () => STOCK,
};

const noSleep = async () => {};

function adapterWith(routes: Routes, extra: Parameters<typeof createBigBuyAdapter>[0] = {}) {
  const { fetchImpl, calls } = fakeFetch(routes);
  const adapter = createBigBuyAdapter({
    baseUrl: "https://api.bigbuy.test",
    getApiKey: async () => KEY,
    fetchImpl,
    sleep: noSleep,
    ...extra,
  });
  return { adapter, calls };
}

async function rejects(p: Promise<unknown>): Promise<SupplierError> {
  try {
    await p;
  } catch (e) {
    return e as SupplierError;
  }
  throw new Error("expected to throw");
}

describe("filtro UE", () => {
  test("países UE sí; fuera de la UE no; null se asume UE", () => {
    expect(isEuWarehouse("ES")).toBe(true);
    expect(isEuWarehouse("DE")).toBe(true);
    expect(isEuWarehouse("US")).toBe(false);
    expect(isEuWarehouse("GB")).toBe(false);
    expect(isEuWarehouse(null)).toBe(true);
  });

  test("días de manipulación solo de almacenes con existencias", () => {
    expect(
      summarizeHandling([
        { warehouse: "ES", quantity: 5, minHandlingDays: 1, maxHandlingDays: 2 },
        { warehouse: "DE", quantity: 3, minHandlingDays: 2, maxHandlingDays: 6 },
        { warehouse: "PL", quantity: 0, minHandlingDays: 9, maxHandlingDays: 9 },
      ])
    ).toEqual({ minDays: 1, maxDays: 6 });
    expect(summarizeHandling([])).toEqual({ minDays: null, maxDays: null });
  });
});

describe("mappers (formas supuestas)", () => {
  test("mapStock normaliza almacén y cantidades", () => {
    expect(mapStock(STOCK[0])).toEqual([{ warehouse: "ES", quantity: 25, minHandlingDays: 1, maxHandlingDays: 2 }]);
    expect(mapStock(STOCK[3])[0].warehouse).toBeNull();
    expect(mapStock(null)).toEqual([]);
  });

  test("mapImages: solo https y sin duplicados", () => {
    expect(mapImages(IMAGES[0])).toEqual(["https://cdn.example.test/1001-a.jpg"]);
  });

  test("mapProduct une todo y calcula stock UE y manipulación", () => {
    const p = mapProduct({ product: PRODUCTS[0], info: INFO[0], images: IMAGES[0], stock: STOCK[0], variations: VARIATIONS });
    expect(p).not.toBeNull();
    expect(p!.supplier).toBe("bigbuy");
    expect(p!.supplierProductId).toBe("1001");
    expect(p!.cost).toEqual({ amount: 18.5, currency: "EUR" });
    expect(p!.suggestedRetail?.amount).toBe(59.9);
    expect(p!.title).toBe("Lámpara de mesa cerámica");
    expect(p!.stock.euTotal).toBe(25);
    expect(p!.delivery).toEqual({ minDays: 1, maxDays: 2 });
    expect(p!.variants).toHaveLength(2);
    expect(p!.variants[0].attributes).toEqual({ Color: "Blanco" });
    expect(p!.variants[1].attributes).toEqual({ Color: "Negro" });
    expect(p!.variants[1].stock).toBe(15);
  });

  test("sin precio mayorista o sin id → null (no se puede evaluar)", () => {
    expect(mapProduct({ product: PRODUCTS[3] })).toBeNull();
    expect(mapProduct({ product: { sku: "x", wholesalePrice: 1 } })).toBeNull();
    expect(mapProduct({ product: "basura" })).toBeNull();
  });

  test("forma inesperada no lanza: degrada a null/vacío", () => {
    const p = mapProduct({ product: { id: 7, wholesalePrice: "12,5" } });
    expect(p).toBeNull(); // coma decimal: no es un número válido → descartado
    const q = mapProduct({ product: { id: 7, wholesalePrice: "12.5" }, stock: { stocks: "no-es-lista" } });
    expect(q!.stock.total).toBe(0);
    expect(q!.title).toBe("BigBuy 7");
  });
});

describe("assertSafeBaseUrl: la key solo viaja por HTTPS (o localhost en tests)", () => {
  test("acepta https y localhost; rechaza http remoto y basura", () => {
    expect(assertSafeBaseUrl("https://api.bigbuy.eu")).toBe("https://api.bigbuy.eu");
    expect(assertSafeBaseUrl("http://localhost:4010")).toBe("http://localhost:4010");
    expect(() => assertSafeBaseUrl("http://api.bigbuy.eu")).toThrow();
    expect(() => assertSafeBaseUrl("ftp://x.y")).toThrow();
    expect(() => assertSafeBaseUrl("no es una url")).toThrow();
  });
});

describe("adaptador BigBuy", () => {
  test("listProducts: UE + con stock por defecto; envía Bearer y parámetros", async () => {
    const { adapter, calls } = adapterWith(catalogRoutes);
    const page = await adapter.listProducts({ pageSize: 5, category: "2501" });

    // 1001 (ES, 25) y 1005 (sin almacén → UE, 4). Fuera: 1002 (US), 1003 (sin stock), 1004 (sin precio).
    expect(page.items.map((p) => p.supplierProductId)).toEqual(["1001", "1005"]);
    expect(page.fetched).toBe(5);
    expect(page.hasMore).toBe(true); // 5 recibidos con pageSize 5
    expect(page.items[0].title).toBe("Lámpara de mesa cerámica");

    const first = calls.find((c) => c.path === "/rest/catalog/products.json")!;
    expect(first.auth).toBe(`Bearer ${KEY}`);
    expect(first.search).toContain("page=1");
    expect(first.search).toContain("pageSize=5");
    expect(first.search).toContain("isoCode=es");
    expect(first.search).toContain("parentTaxonomy=2501");
  });

  test("euOnly=false incluye almacenes no UE; inStockOnly=false incluye sin stock", async () => {
    const { adapter } = adapterWith(catalogRoutes);
    const all = await adapter.listProducts({ euOnly: false, inStockOnly: false });
    expect(all.items.map((p) => p.supplierProductId)).toEqual(["1001", "1002", "1003", "1005"]);
    const nonEu = await adapter.listProducts({ euOnly: false });
    expect(nonEu.items.map((p) => p.supplierProductId)).toEqual(["1001", "1002", "1005"]);
  });

  test("búsqueda local sin tildes ni mayúsculas", async () => {
    const { adapter } = adapterWith(catalogRoutes);
    const page = await adapter.listProducts({ query: "LAMPARA" });
    expect(page.items.map((p) => p.supplierProductId)).toEqual(["1001"]);
  });

  test("los bulk (info/imágenes/stock) se cachean con TTL", async () => {
    let t = 0;
    const { adapter, calls } = adapterWith(catalogRoutes, { now: () => t, cacheTtlMs: 1000 });
    await adapter.listProducts();
    await adapter.listProducts();
    const bulkCalls = () => calls.filter((c) => c.path.includes("productsstock")).length;
    expect(bulkCalls()).toBe(1);
    t = 5000; // TTL vencido
    await adapter.listProducts();
    expect(bulkCalls()).toBe(2);
  });

  test("sin credencial → not_configured y NO se llama a la red", async () => {
    const { fetchImpl, calls } = fakeFetch(catalogRoutes);
    const adapter = createBigBuyAdapter({ baseUrl: "https://api.bigbuy.test", getApiKey: async () => null, fetchImpl });
    const err = await rejects(adapter.listProducts());
    expect(err.code).toBe("not_configured");
    expect(calls).toHaveLength(0);
    expect(await adapter.auth()).toEqual({ ok: false, code: "not_configured" });
  });

  test("auth(): ok / unauthorized / unreachable", async () => {
    const probe = "/rest/catalog/taxonomies.json";
    expect(await adapterWith({ [probe]: () => [] }).adapter.auth()).toEqual({ ok: true });
    expect(
      await adapterWith({ [probe]: () => new Response("{}", { status: 401 }) }).adapter.auth()
    ).toEqual({ ok: false, code: "unauthorized" });
    expect(
      await adapterWith({ [probe]: () => new Response("{}", { status: 500 }) }, { maxRetries: 0 }).adapter.auth()
    ).toEqual({ ok: false, code: "unreachable" });
  });

  test("getProduct: une las piezas; 404 → null; id inválido → invalid_request", async () => {
    const { adapter } = adapterWith({
      "/rest/catalog/product/1001.json": () => PRODUCTS[0],
      "/rest/catalog/productinformation/1001.json": () => INFO[0],
      "/rest/catalog/productimages/1001.json": () => IMAGES[0],
      "/rest/catalog/productstock/1001.json": () => STOCK[0],
      "/rest/catalog/productvariations/1001.json": () => VARIATIONS,
    });
    const p = await adapter.getProduct("1001");
    expect(p!.title).toBe("Lámpara de mesa cerámica");
    expect(p!.stock.euTotal).toBe(25);
    expect(p!.variants).toHaveLength(2);

    expect(await adapter.getProduct("9999")).toBeNull();
    expect((await rejects(adapter.getProduct("../etc/passwd"))).code).toBe("invalid_request");
    expect((await rejects(adapter.getProduct("1 2"))).code).toBe("invalid_request");
  });

  test("getProduct: si faltan piezas auxiliares (404) sigue con lo que hay", async () => {
    const { adapter } = adapterWith({ "/rest/catalog/product/1001.json": () => PRODUCTS[0] });
    const p = await adapter.getProduct("1001");
    expect(p!.supplierProductId).toBe("1001");
    expect(p!.stock.total).toBe(0);
    expect(p!.images).toEqual([]);
  });
});

describe("integración: adaptador real contra un servidor HTTP local (mock de BigBuy)", () => {
  let server: ReturnType<typeof Bun.serve>;
  let base: string;
  let productsHits = 0;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (req.headers.get("authorization") !== `Bearer ${KEY}`) {
          return new Response('{"error":"nope"}', { status: 401 });
        }
        switch (url.pathname) {
          case "/rest/catalog/products.json":
            productsHits++;
            if (productsHits === 1) return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
            return Response.json(PRODUCTS);
          case "/rest/catalog/productsinformation.json":
            return Response.json(INFO);
          case "/rest/catalog/productsimages.json":
            return Response.json(IMAGES);
          case "/rest/catalog/productsstock.json":
            return Response.json(STOCK);
          case "/rest/catalog/taxonomies.json":
            return Response.json([]);
          case "/rest/catalog/product/1001.json":
            return new Response("<html>no soy json</html>", { status: 200 });
          default:
            return new Response("{}", { status: 404 });
        }
      },
    });
    base = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("429 → reintento con Retry-After → 200, con paginación y filtro UE", async () => {
    const adapter = createBigBuyAdapter({ baseUrl: base, getApiKey: async () => KEY, sleep: noSleep });
    const page = await adapter.listProducts({ pageSize: 5 });
    expect(productsHits).toBe(2); // 1.º 429, 2.º ok
    expect(page.items.map((p) => p.supplierProductId)).toEqual(["1001", "1005"]);
  });

  test("key incorrecta → 401 del proveedor → 'unauthorized' sin filtrar la key", async () => {
    const adapter = createBigBuyAdapter({ baseUrl: base, getApiKey: async () => "otra-key", sleep: noSleep });
    expect(await adapter.auth()).toEqual({ ok: false, code: "unauthorized" });
    const err = await rejects(adapter.listProducts());
    expect(err.code).toBe("unauthorized");
    expect(JSON.stringify(err.toJSON())).not.toContain("otra-key");
  });

  test("auth() ok con la key buena", async () => {
    const adapter = createBigBuyAdapter({ baseUrl: base, getApiKey: async () => KEY, sleep: noSleep });
    expect(await adapter.auth()).toEqual({ ok: true });
  });

  test("respuesta que no es JSON → 'bad_response' (sin cuerpo del proveedor)", async () => {
    const adapter = createBigBuyAdapter({ baseUrl: base, getApiKey: async () => KEY, sleep: noSleep });
    const err = await rejects(adapter.getProduct("1001"));
    expect(err.code).toBe("bad_response");
    expect(JSON.stringify(err.toJSON())).not.toContain("html");
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseCredentialStore, type SupplierTokens, type TokenStore } from "../credentials";
import { SupplierError } from "../errors";
import { createCjAuth, parseTokens, type CjAuthState } from "./auth";
import { classifyCjResponse, createCjClient, isTokenRejected, type CjQueue, type CjRequest } from "./client";
import { CJ_ENDPOINTS } from "./endpoints";
import { CJ_CURATED_CATEGORIES, CJ_CURATED_IDS } from "./categories";
import { createCjAdapter, type CjCuratedIndexState } from "./index";
import { cleanDescription, mapCjListItem, mapCjProduct, parseCjPrice, parseCjRoutes } from "./mappers";
import type { SupplierProduct } from "../types";

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, "__fixtures__", `${name}.json`), "utf8"));

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 24 * 60 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (data: unknown) => json({ code: 200, result: true, message: "Success", data });

/** Reloj y espera falsos: `sleep` avanza el reloj y registra cuánto se esperó. */
function fakeTime() {
  let t = NOW;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}
const newQueue = (): CjQueue => ({ tail: Promise.resolve(), lastFinishedAt: 0 });

function memoryTokens(initial: SupplierTokens | null = null) {
  const saved: SupplierTokens[] = [];
  let current = initial;
  const store: TokenStore = {
    load: async () => current,
    save: async (t) => {
      current = t;
      saved.push(t);
    },
  };
  return { store, saved };
}
const newState = (): CjAuthState => ({ current: null, loadedAt: 0, rejected: null, inflight: null });
const newIndex = (): CjCuratedIndexState => ({ value: null, inflight: null });

const validTokens = (over: Partial<SupplierTokens> = {}): SupplierTokens => ({
  accessToken: "tok-valido",
  accessTokenExpiry: iso(NOW + 100 * DAY),
  refreshToken: "ref-valido",
  refreshTokenExpiry: iso(NOW + 100 * DAY),
  ...over,
});

describe("classifyCjResponse: códigos de CJ → nuestros códigos", () => {
  test("éxito: 200 y el 0 de la lista de almacenes", () => {
    expect(classifyCjResponse(200, { code: 200, result: true, data: { a: 1 } })).toEqual({ kind: "ok", data: { a: 1 } });
    expect(classifyCjResponse(200, fixture("warehouses")).kind).toBe("ok");
  });

  test("límite de frecuencia: se reintenta, también con HTTP 200", () => {
    expect(classifyCjResponse(429, { code: 1600200 })).toEqual({ kind: "retry", code: "rate_limited" });
    expect(classifyCjResponse(200, { code: 1600200, result: false })).toEqual({ kind: "retry", code: "rate_limited" });
    expect(classifyCjResponse(429, null)).toEqual({ kind: "retry", code: "rate_limited" });
  });

  test("sin puntos: rate_limited y sin reintento", () => {
    for (const code of [429, 1600201, 16900500]) {
      expect(classifyCjResponse(429, { code, result: false })).toEqual({ kind: "fail", code: "rate_limited" });
    }
  });

  test("token rechazado frente a credencial inválida", () => {
    expect(classifyCjResponse(200, { code: 1600001 })).toEqual({ kind: "fail", code: "unauthorized", tokenRejected: true });
    expect(classifyCjResponse(200, { code: 1600005 })).toEqual({ kind: "fail", code: "unauthorized" });
    expect(classifyCjResponse(200, { code: 1600014 })).toEqual({ kind: "fail", code: "unauthorized" });
  });

  test("resto de códigos", () => {
    expect(classifyCjResponse(200, { code: 1602001 })).toEqual({ kind: "fail", code: "not_found" });
    expect(classifyCjResponse(200, { code: 1600300 })).toEqual({ kind: "fail", code: "invalid_request" });
    expect(classifyCjResponse(200, { code: 1600000 })).toEqual({ kind: "retry", code: "upstream" });
    expect(classifyCjResponse(200, { code: 1600301 })).toEqual({ kind: "retry", code: "timeout" });
    expect(classifyCjResponse(200, { code: 9999999 })).toEqual({ kind: "fail", code: "upstream" });
    expect(classifyCjResponse(503, null)).toEqual({ kind: "retry", code: "upstream" });
    expect(classifyCjResponse(200, "no es un sobre")).toEqual({ kind: "fail", code: "bad_response" });
  });
});

describe("cliente: cola y reintentos", () => {
  const req: CjRequest = { method: "GET", path: "/x" };

  test("una petición cada vez, con espera desde la respuesta anterior (también en concurrencia)", async () => {
    const time = fakeTime();
    const starts: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const client = createCjClient({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      gapMs: 2000,
      fetchImpl: (async () => {
        starts.push(time.now());
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        time.advance(300); // lo que tarda CJ en responder
        inFlight--;
        return ok(null);
      }) as typeof fetch,
    });
    await Promise.all([client.call(req), client.call(req), client.call(req)]);
    expect(maxInFlight).toBe(1);
    expect(starts).toEqual([NOW, NOW + 2300, NOW + 4600]);
  });

  test("1600200: máximo 3 reintentos con backoff, y cada uno pasa por la cola", async () => {
    const time = fakeTime();
    let calls = 0;
    const client = createCjClient({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      gapMs: 2000,
      fetchImpl: (async () => {
        calls++;
        return json({ code: 1600200, result: false, message: "Too Many Requests" }, 429);
      }) as typeof fetch,
    });
    await expect(client.call(req)).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toBe(4);
    expect(time.sleeps.filter((ms) => [1000, 2000, 4000].includes(ms)).length).toBeGreaterThanOrEqual(3);
  });

  test("se recupera si un reintento funciona", async () => {
    const time = fakeTime();
    let calls = 0;
    const client = createCjClient({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      fetchImpl: (async () => (++calls < 3 ? json({ code: 1600200 }, 429) : ok({ fine: true }))) as typeof fetch,
    });
    expect(await client.call(req)).toEqual({ fine: true });
    expect(calls).toBe(3);
  });

  test("sin puntos no se reintenta", async () => {
    const time = fakeTime();
    let calls = 0;
    const client = createCjClient({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      fetchImpl: (async () => {
        calls++;
        return json({ code: 429, result: false, message: "Insufficient API points" }, 429);
      }) as typeof fetch,
    });
    await expect(client.call(req)).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toBe(1);
  });

  test("el mensaje de CJ no sale nunca en el error", async () => {
    const time = fakeTime();
    const client = createCjClient({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      fetchImpl: (async () => json({ code: 1600300, result: false, message: "SECRETO interno de CJ" })) as typeof fetch,
    });
    const err = await client.call(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SupplierError);
    expect(JSON.stringify(err) + String((err as Error).message)).not.toContain("SECRETO");
  });

  test("red caída y timeout se reintentan y acaban en un código seguro", async () => {
    const time = fakeTime();
    const client = createCjClient({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      fetchImpl: (async () => {
        throw new Error("connect ECONNREFUSED token=abc");
      }) as typeof fetch,
    });
    const err = await client.call(req).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "upstream" });
    expect(String((err as Error).message)).not.toContain("abc");
  });
});

describe("sesión: nunca un token nuevo por petición", () => {
  function setup(tokens: SupplierTokens | null, responder: (r: CjRequest) => unknown, apiKey: string | null = "CJ@api@key") {
    const time = fakeTime();
    const calls: CjRequest[] = [];
    const client = {
      call: async (r: CjRequest) => {
        calls.push(r);
        return responder(r);
      },
    };
    const mem = memoryTokens(tokens);
    const auth = createCjAuth({ client, getApiKey: async () => apiKey, store: mem.store, now: time.now, state: newState() });
    return { auth, calls, time, ...mem };
  }
  const issued = { accessToken: "tok-nuevo", accessTokenExpiryDate: iso(NOW + 180 * DAY), refreshToken: "ref-nuevo", refreshTokenExpiryDate: iso(NOW + 180 * DAY) };

  test("reutiliza el token guardado sin llamar a CJ, también entre peticiones", async () => {
    const s = setup(validTokens(), () => issued);
    expect(await s.auth.getToken()).toBe("tok-valido");
    expect(await s.auth.getToken()).toBe("tok-valido");
    expect(s.calls).toEqual([]);
    expect(s.saved).toEqual([]);
  });

  test("sin token: una sola llamada a getAccessToken aunque haya concurrencia, y se guarda", async () => {
    const s = setup(null, () => issued);
    const tokens = await Promise.all([s.auth.getToken(), s.auth.getToken(), s.auth.getToken()]);
    expect(tokens).toEqual(["tok-nuevo", "tok-nuevo", "tok-nuevo"]);
    expect(s.calls.map((c) => c.path)).toEqual([CJ_ENDPOINTS.getAccessToken]);
    expect(s.saved.length).toBe(1);
    expect(await s.auth.getToken()).toBe("tok-nuevo");
    expect(s.calls.length).toBe(1);
  });

  test("a menos de 24 h de caducar: refresh, no un token nuevo con la key", async () => {
    const s = setup(validTokens({ accessTokenExpiry: iso(NOW + DAY / 2) }), () => issued);
    expect(await s.auth.getToken()).toBe("tok-nuevo");
    expect(s.calls.map((c) => c.path)).toEqual([CJ_ENDPOINTS.refreshAccessToken]);
    expect(s.calls[0].body).toEqual({ refreshToken: "ref-valido" });
  });

  test("refresh rechazado: cae a getAccessToken con la key", async () => {
    const s = setup(validTokens({ accessTokenExpiry: iso(NOW - DAY) }), (r) => {
      if (r.path === CJ_ENDPOINTS.refreshAccessToken) throw new SupplierError("unauthorized");
      return issued;
    });
    expect(await s.auth.getToken()).toBe("tok-nuevo");
    expect(s.calls.map((c) => c.path)).toEqual([CJ_ENDPOINTS.refreshAccessToken, CJ_ENDPOINTS.getAccessToken]);
  });

  test("refresh caducado: va directo a la key", async () => {
    const s = setup(validTokens({ accessTokenExpiry: iso(NOW - DAY), refreshTokenExpiry: iso(NOW - DAY) }), () => issued);
    await s.auth.getToken();
    expect(s.calls.map((c) => c.path)).toEqual([CJ_ENDPOINTS.getAccessToken]);
  });

  test("fallo temporal en el refresh: no gasta la key, sube el error", async () => {
    const s = setup(validTokens({ accessTokenExpiry: iso(NOW - DAY) }), () => {
      throw new SupplierError("upstream");
    });
    await expect(s.auth.getToken()).rejects.toMatchObject({ code: "upstream" });
    expect(s.calls.length).toBe(1);
  });

  test("sin key ni token válido: not_configured", async () => {
    const s = setup(null, () => issued, null);
    await expect(s.auth.getToken()).rejects.toMatchObject({ code: "not_configured" });
    expect(s.calls).toEqual([]);
  });

  test("token rechazado: invalidate fuerza renovarlo aunque la BD siga teniéndolo", async () => {
    const s = setup(validTokens(), () => issued);
    const first = await s.auth.getToken();
    s.auth.invalidate(first);
    expect(await s.auth.getToken()).toBe("tok-nuevo");
    expect(s.calls.map((c) => c.path)).toEqual([CJ_ENDPOINTS.refreshAccessToken]);
  });

  test("si falla el almacén, el token vale en memoria y no se registra", async () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => logged.push(a);
    try {
      const time = fakeTime();
      const failing: TokenStore = {
        load: async () => {
          throw new Error("bd caída");
        },
        save: async () => {
          throw new Error("bd caída");
        },
      };
      const auth = createCjAuth({ client: { call: async () => issued }, getApiKey: async () => "k", store: failing, now: time.now, state: newState() });
      expect(await auth.getToken()).toBe("tok-nuevo");
      expect(JSON.stringify(logged)).not.toContain("tok-nuevo");
    } finally {
      console.error = original;
    }
  });

  test("parseTokens: formato real de caducidad y token ausente", () => {
    const t = parseTokens({ accessToken: "a", accessTokenExpiryDate: "2027-05-01T00:09:44+08:00" }, NOW);
    expect(t.accessTokenExpiry).toBe("2027-04-30T16:09:44.000Z");
    expect(t.refreshToken).toBeNull();
    expect(() => parseTokens({}, NOW)).toThrow();
  });
});

describe("credenciales: rotar o borrar la key borra los tokens", () => {
  function fakeDb() {
    const ops: { op: string; payload?: unknown }[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({ data: { updated_at: "2026-11-02" }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    const db = {
      from: () => ({
        upsert: (payload: unknown) => (ops.push({ op: "upsert", payload }), chain),
        delete: () => (ops.push({ op: "delete" }), chain),
      }),
    };
    return { ops, getDb: async () => db as never };
  }

  test("setApiKey pone los tokens a null", async () => {
    const f = fakeDb();
    await createSupabaseCredentialStore(f.getDb).setApiKey("cj", "nueva");
    expect(f.ops[0].payload).toMatchObject({ api_key: "nueva", access_token: null, refresh_token: null, access_token_expiry: null, refresh_token_expiry: null });
  });

  test("delete elimina la fila entera", async () => {
    const f = fakeDb();
    await createSupabaseCredentialStore(f.getDb).delete("cj");
    expect(f.ops).toEqual([{ op: "delete" }]);
  });
});

describe("mappers con respuestas reales", () => {
  test("precio: número, texto, rango (peor caso) e inválidos", () => {
    expect(parseCjPrice(10.43)).toBe(10.43);
    expect(parseCjPrice("10.43")).toBe(10.43);
    expect(parseCjPrice("1.80 -- 18.00")).toBe(18);
    for (const v of [null, "", "gratis", 0, -3, "0"]) expect(parseCjPrice(v)).toBeNull();
  });

  test("listado V1 real: almacén ES explícito, sin cantidad", () => {
    const raw = fixture("list-v1-es-vase").data.list[0];
    const p = mapCjListItem({ ...raw, supplierId: "seller-1", supplierName: "Vendedor" });
    expect(p).toMatchObject({
      supplier: "cj",
      supplierProductId: "2116002325246046209",
      title: "Vase Acrylic Cylindrical Base Wood 12x12x30cm",
      cost: { amount: 10.43, currency: "USD" },
      weightKg: 0.51,
      stock: { exact: false, euTotal: 0, eu: [{ warehouse: "ES" }] },
      origin: { productType: "SUPPLIER_SHIPPED_PRODUCT", sellerId: "seller-1", sellerName: "Vendedor" },
    });
    expect(p?.images.length).toBe(1);
  });

  test("listado: sin almacén listado de la UE explícito queda fuera (fail-closed)", () => {
    const raw = fixture("list-v1-es-vase").data.list[0];
    for (const shippingCountryCodes of [undefined, null, [], ["US"], ["CN", "US"], ["DE"], [null]]) {
      expect(mapCjListItem({ ...raw, shippingCountryCodes })).toBeNull();
    }
    expect(mapCjListItem({ ...raw, shippingCountryCodes: ["CN", "ES"] })?.stock.eu.map((e) => e.warehouse)).toEqual(["ES"]);
  });

  test("listado: sin precio, de prueba o sin título queda fuera", () => {
    const raw = fixture("list-v1-es-vase").data.list[0];
    expect(mapCjListItem({ ...raw, sellPrice: "" })).toBeNull();
    expect(mapCjListItem({ ...raw, isTestProduct: true })).toBeNull();
    expect(mapCjListItem({ ...raw, productNameEn: "" })).toBeNull();
  });

  test("detalle + inventario reales", () => {
    const p = mapCjProduct(fixture("product-es").data, fixture("inventory-es").data);
    expect(p).toMatchObject({
      cost: { amount: 10.43, currency: "USD" },
      suggestedRetail: { amount: 35.78, currency: "USD" },
      stock: { total: 100, euTotal: 100, eu: [{ warehouse: "ES", quantity: 100 }] },
    });
    expect(p?.stock.exact).toBeUndefined();
    expect(p?.variants[0]).toMatchObject({ sku: "CJFU35366580001", stock: 100, attributes: {} });
    expect(p?.description).not.toContain("<");
    expect(p?.images.every((u) => u.startsWith("https://cf.cjdropshipping.com/"))).toBe(true);
  });

  const detail = (over: object = {}) => ({
    pid: "p1",
    productNameEn: "Lamp",
    sellPrice: "5.00 -- 9.00",
    productKeyEn: "Color-Size",
    variants: [
      { vid: "v1", variantKey: "Gray-S", variantSellPrice: 5, variantSku: "A" },
      { vid: "v2", variantKey: "Red-L", variantSellPrice: 9, variantSku: "B" },
    ],
    ...over,
  });
  const stockOf = (vid: string, countryCode: string, cjInventory: number, factoryInventory = 0) => ({
    vid,
    inventory: [{ countryCode, cjInventory, factoryInventory }],
  });

  test("solo cuenta cjInventory en almacén UE; fábrica y fuera de la UE no", () => {
    const p = mapCjProduct(detail(), {
      inventories: [
        { countryCode: "ES", cjInventoryNum: 10, factoryInventoryNum: 500 },
        { countryCode: "CN", cjInventoryNum: 900, factoryInventoryNum: 100000 },
        { countryCode: "US", cjInventoryNum: 7 },
        { countryCode: null, cjInventoryNum: 50 },
      ],
      variantInventories: [stockOf("v1", "ES", 10, 500), stockOf("v2", "CN", 900)],
    });
    expect(p?.stock.euTotal).toBe(10);
    expect(p?.stock.eu).toEqual([{ warehouse: "ES", quantity: 10, minHandlingDays: null, maxHandlingDays: null }]);
    expect(p?.variants.map((v) => v.supplierVariantId)).toEqual(["v1"]);
    expect(p?.variants[0].attributes).toEqual({ Color: "Gray", Size: "S" });
    // El coste es el de las variantes que se pueden servir.
    expect(p?.cost.amount).toBe(5);
  });

  test("stock solo de fábrica en la UE: no elegible", () => {
    const p = mapCjProduct(detail(), {
      inventories: [{ countryCode: "ES", cjInventoryNum: 0, factoryInventoryNum: 999 }],
      variantInventories: [stockOf("v1", "ES", 0, 999)],
    });
    expect(p?.stock.euTotal).toBe(0);
    expect(p?.stock.eu).toEqual([]);
    expect(p?.variants).toEqual([]);
  });

  test("sin inventario (fallo o vacío) no se inventa stock", () => {
    for (const inv of [null, {}, { inventories: [] }]) {
      const p = mapCjProduct(detail(), inv);
      expect(p?.stock.eu).toEqual([]);
      expect(p?.stock.euTotal).toBe(0);
    }
  });

  test("total UE sin desglose por variante: las variantes no se pueden servir, sin stock UE", () => {
    const p = mapCjProduct(detail(), { inventories: [{ countryCode: "ES", cjInventoryNum: 40 }] });
    expect(p?.stock.eu).toEqual([]);
  });

  test("imágenes de hosts no permitidos fuera", () => {
    const p = mapCjProduct(
      detail({ bigImage: "https://evil.example/a.jpg", productImageSet: ["http://cf.cjdropshipping.com/b.jpg", "https://oss-cf.cjdropshipping.com/c.jpg"] }),
      null,
    );
    expect(p?.images).toEqual(["https://oss-cf.cjdropshipping.com/c.jpg"]);
  });

  test("descripción: sin HTML, scripts ni imágenes", () => {
    expect(cleanDescription('<p>Hola &amp; adiós<br></p><script>alert(1)</script><img src="x"><ul><li>Uno</li></ul>')).toBe("Hola & adiós\nUno");
    expect(cleanDescription('<img src="x" onerror="y">')).toBeNull();
    expect(cleanDescription("<b>abierto")).toBe("abierto");
    expect(cleanDescription("texto <img src=x onerror=alert(1)")).toBe("texto");
    expect(cleanDescription(null)).toBeNull();
  });
});

/** Adaptador completo contra una API de CJ falsa (reloj, cola, sesión e índice propios). */
function adapter(routes: (path: string, url: URL, init?: RequestInit) => Response, tokens: SupplierTokens | null = validTokens(), apiKey: string | null = "k") {
  const time = fakeTime();
  const index = newIndex();
  const seen: { path: string; url: URL; token: string | null }[] = [];
  const mem = memoryTokens(tokens);
  const a = createCjAdapter({
    now: time.now,
    sleep: time.sleep,
    queue: newQueue(),
    authState: newState(),
    curatedIndex: index,
    tokenStore: mem.store,
    getApiKey: async () => apiKey,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api2.0/v1", "");
      seen.push({ path, url, token: new Headers(init?.headers).get("CJ-Access-Token") });
      return routes(path, url, init);
    }) as typeof fetch,
  });
  return { a, seen, mem, time, index };
}

describe("adaptador completo contra una API falsa", () => {
  test("sin filtro de categorías: V1 con almacén ES y palabra clave, y calcula hasMore", async () => {
    const { a, seen } = adapter(() => json(fixture("list-v1-es-vase")));
    const page = await a.listProducts({ query: " vase ", pageSize: 3, euOnly: false, curatedOnly: false });
    expect(seen[0].path).toBe("/product/list");
    expect(seen[0].url.searchParams.get("countryCode")).toBe("ES");
    expect(seen[0].url.searchParams.get("productNameEn")).toBe("vase");
    expect(seen[0].token).toBe("tok-valido");
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((p) => p.stock.eu[0].warehouse === "ES")).toBe(true);
    expect(page.hasMore).toBe(true);
  });

  test("el mismo listado se reutiliza un minuto", async () => {
    const { a, seen } = adapter(() => json(fixture("list-v1-es-vase")));
    await a.listProducts({ query: "vase", curatedOnly: false });
    await a.listProducts({ query: "vase", curatedOnly: false });
    expect(seen.length).toBe(1);
  });

  test("getProduct: detalle e inventario, en serie", async () => {
    const { a, seen } = adapter((path) => json(fixture(path === CJ_ENDPOINTS.inventory ? "inventory-es" : "product-es")));
    const p = await a.getProduct("2116002325246046209");
    expect(seen.map((s) => s.path)).toEqual([CJ_ENDPOINTS.product, CJ_ENDPOINTS.inventory]);
    expect(p?.stock.euTotal).toBe(100);
  });

  test("getProduct: no encontrado → null; id raro → invalid_request sin llamar a CJ", async () => {
    const { a, seen } = adapter(() => json({ code: 1602001, result: false, message: "Product not found" }));
    expect(await a.getProduct("123")).toBeNull();
    const before = seen.length;
    await expect(a.getProduct("../../x")).rejects.toMatchObject({ code: "invalid_request" });
    expect(seen.length).toBe(before);
  });

  test("token rechazado por CJ: renueva una vez y reintenta con el nuevo", async () => {
    let rejected = false;
    const { a, seen, mem } = adapter((path) => {
      if (path === CJ_ENDPOINTS.refreshAccessToken) {
        return ok({ accessToken: "tok-2", accessTokenExpiryDate: iso(NOW + 180 * DAY), refreshToken: "r2", refreshTokenExpiryDate: iso(NOW + 180 * DAY) });
      }
      if (!rejected) {
        rejected = true;
        return json({ code: 1600001, result: false, message: "Invalid token" }, 401);
      }
      return json(fixture("list-v1-es-vase"));
    });
    await a.listProducts({ curatedOnly: false });
    expect(seen.map((s) => s.token)).toEqual(["tok-valido", null, "tok-2"]);
    expect(mem.saved.at(-1)?.accessToken).toBe("tok-2");
  });

  test("auth(): sin key, key rechazada, caída y correcto", async () => {
    expect(await adapter(() => ok([]), null, null).a.auth()).toEqual({ ok: false, code: "not_configured" });
    expect(await adapter(() => json({ code: 1600005, result: false }), null).a.auth()).toEqual({ ok: false, code: "unauthorized" });
    expect(await adapter(() => json({}, 503)).a.auth()).toEqual({ ok: false, code: "unreachable" });
    expect(await adapter(() => json(fixture("warehouses"))).a.auth()).toEqual({ ok: true });
  });

  test("los tokens no aparecen en errores", async () => {
    const { a } = adapter(() => json({ code: 1600300, result: false, message: "bad" }));
    const err = await a.listProducts().catch((e: unknown) => e);
    expect(`${String(err)} ${JSON.stringify(err)}`).not.toContain("tok-valido");
    expect(isTokenRejected(err)).toBe(false);
  });
});

describe("flete real", () => {
  test("rutas reales: precio, plazo y método", () => {
    const routes = parseCjRoutes(fixture("freight-es-es").data, "ES");
    expect(routes[0]).toEqual({ origin: "ES", method: "UPS ES to Multi-Region", cost: { amount: 9.92, currency: "USD" }, minDays: 3, maxDays: 5 });
    expect(parseCjRoutes(fixture("freight-de-es-sin-rutas").data, "DE")).toEqual([]);
  });

  test("de más barata a más cara; total con tasas si es mayor; 0, sin precio o con error fuera", () => {
    const routes = parseCjRoutes(
      [
        { logisticName: "Cara", logisticPrice: 12, logisticAging: "1-2" },
        { logisticName: "Tasas", logisticPrice: 5, totalPostageFee: 8, logisticAging: "7" },
        { logisticName: "Gratis", logisticPrice: 0, logisticAging: "2-7" },
        { logisticName: "SinPrecio", logisticAging: "2-7" },
        { logisticName: "Rota", logisticPrice: 1, error: "no disponible" },
        { logisticPrice: 3 },
      ],
      "ES",
    );
    expect(routes.map((r) => [r.method, r.cost.amount, r.minDays, r.maxDays])).toEqual([
      ["Tasas", 8, 7, 7],
      ["Cara", 12, 1, 2],
    ]);
  });

  const product = (stockBy: Record<string, Record<string, number>>, weights: Record<string, number> = {}): SupplierProduct => {
    const totals: Record<string, number> = {};
    for (const by of Object.values(stockBy)) for (const [w, q] of Object.entries(by)) totals[w] = (totals[w] ?? 0) + q;
    return {
      supplier: "cj",
      supplierProductId: "p1",
      sku: null,
      ean: null,
      title: "x",
      description: null,
      images: [],
      category: null,
      weightKg: null,
      cost: { amount: 5, currency: "USD" },
      suggestedRetail: null,
      stock: {
        total: 0,
        eu: Object.entries(totals).map(([warehouse, quantity]) => ({ warehouse, quantity, minHandlingDays: null, maxHandlingDays: null })),
        euTotal: 0,
      },
      delivery: { minDays: null, maxDays: null },
      variants: Object.entries(stockBy).map(([vid, by]) => ({
        supplierVariantId: vid,
        sku: null,
        name: vid,
        cost: { amount: 5, currency: "USD" },
        suggestedRetail: null,
        stock: 1,
        attributes: {},
        image: null,
        weightKg: weights[vid] ?? null,
        euStockByWarehouse: by,
      })),
    };
  };

  function freightAdapter(answers: Record<string, unknown[]>) {
    const time = fakeTime();
    const bodies: { startCountryCode: string; endCountryCode: string; products: { vid: string }[] }[] = [];
    const a = createCjAdapter({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      authState: newState(),
      tokenStore: memoryTokens(validTokens()).store,
      getApiKey: async () => "k",
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return ok(answers[`${body.startCountryCode}>${body.endCountryCode}`] ?? []);
      }) as typeof fetch,
    });
    return { a, bodies, time };
  }
  const route = { logisticName: "UPS", logisticPrice: 9.92, logisticAging: "3-5" };

  test("prueba primero el almacén del propio país y usa la variante más pesada", async () => {
    const { a, bodies } = freightAdapter({ "ES>ES": [route] });
    const r = await a.getShippingRoute!(product({ v1: { ES: 5, DE: 500 }, v2: { ES: 5 } }, { v1: 0.2, v2: 0.9 }), "ES");
    expect(r).toMatchObject({ origin: "ES", method: "UPS" });
    expect(bodies).toEqual([{ startCountryCode: "ES", endCountryCode: "ES", products: [{ quantity: 1, vid: "v2" }] }]);
  });

  test("DE→ES: se comprueba, y si se abre se usa", async () => {
    const closed = freightAdapter({});
    expect(await closed.a.getShippingRoute!(product({ v1: { DE: 10 } }), "ES")).toBeNull();
    expect(closed.bodies.map((b) => b.startCountryCode)).toEqual(["DE"]);

    const open = freightAdapter({ "DE>ES": [route] });
    expect(await open.a.getShippingRoute!(product({ v1: { DE: 10 } }), "ES")).toMatchObject({ origin: "DE" });
  });

  test("sin stock en ningún almacén o sin desglose por variante: no consulta", async () => {
    const { a, bodies } = freightAdapter({ "ES>ES": [route] });
    expect(await a.getShippingRoute!(product({}), "ES")).toBeNull();
    expect(bodies).toEqual([]);
  });

  test("el flete se reutiliza una hora: el modal no consulta a cada tecla", async () => {
    const { a, bodies, time } = freightAdapter({ "ES>ES": [route] });
    const p = product({ v1: { ES: 5 } });
    await a.getShippingRoute!(p, "ES");
    await a.getShippingRoute!(p, "ES");
    expect(bodies.length).toBe(1);
    time.advance(61 * 60_000);
    await a.getShippingRoute!(p, "ES");
    expect(bodies.length).toBe(2);
  });

  test("el stock del detalle se desglosa por almacén", () => {
    const p = mapCjProduct(fixture("product-es").data, fixture("inventory-es").data);
    expect(p?.variants[0].euStockByWarehouse).toEqual({ ES: 100 });
    expect(p?.variants[0].weightKg).toBe(0.51);
  });
});

describe("diagnóstico en logs", () => {
  async function logged(body: unknown, status = 200) {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void lines.push(a.join(" "));
    try {
      const time = fakeTime();
      const client = createCjClient({ now: time.now, sleep: time.sleep, queue: newQueue(), fetchImpl: (async () => json(body, status)) as typeof fetch });
      await client.call({ method: "GET", path: "/x", token: "tok-secreto" }).catch(() => undefined);
    } finally {
      console.error = original;
    }
    return lines;
  }

  test("registra ruta, estado y código; nunca el mensaje de CJ ni el token", async () => {
    const lines = await logged({ code: 1600300, result: false, message: "SECRETO" });
    expect(lines).toEqual(["[cj] /x HTTP 200 code=1600300"]);
    expect(lines.join()).not.toContain("tok-secreto");
  });

  test("distingue el límite por IP compartida, sin propagarlo", async () => {
    const lines = await logged({ code: 1600000, result: false, message: "one ip limit 3 users, Your Ip is 1.2.3.4" });
    expect(lines[0]).toContain("límite por IP compartida");
    expect(lines.join()).not.toContain("1.2.3.4");
  });

  test("una respuesta correcta no registra nada", async () => {
    expect(await logged({ code: 200, result: true, data: {} })).toEqual([]);
  });
});

describe("listado curado por categorías", () => {
  const CURATED = CJ_CURATED_CATEGORIES[0].id;
  const PET = "2410110337031615300"; // Pet Drinking & Feeding: fuera de la lista
  const base = fixture("list-v1-es-vase").data.list[0];
  const item = (n: number, categoryId: string, title: string) => ({ ...base, pid: `p${n}`, productSku: `SKU${n}`, productNameEn: title, categoryId });

  /** Almacén falso de 450 productos en 3 páginas de 200: 1 de cada 3 fuera de la lista. */
  const warehouse = Array.from({ length: 450 }, (_, i) =>
    i % 3 === 2 ? item(i, PET, `Pet Bowl ${i}`) : item(i, CURATED, i % 2 ? `Vase Glass Wide ${i}` : `Photo Frame Wood ${i}`),
  );
  function cjList(url: URL) {
    const pageNum = Number(url.searchParams.get("pageNum"));
    const size = Number(url.searchParams.get("pageSize"));
    return ok({ pageNum, pageSize: size, total: warehouse.length, list: warehouse.slice((pageNum - 1) * size, pageNum * size) });
  }

  test("lista solo hojas válidas y sin repetir", () => {
    expect(CJ_CURATED_IDS.size).toBe(CJ_CURATED_CATEGORIES.length);
    for (const c of CJ_CURATED_CATEGORIES) expect(c.id).toMatch(/^[A-Za-z0-9-]{1,64}$/);
    expect(CJ_CURATED_IDS.has(PET)).toBe(false);
    expect(CJ_CURATED_IDS.has("C329460A-9074-4E42-B1FD-D9E91568A64B")).toBe(false); // fiesta y confeti
  });

  test("por defecto recorre el almacén ES una vez y se queda con las categorías curadas", async () => {
    const { a, seen } = adapter((_path, url) => cjList(url));
    const page = await a.listProducts({ pageSize: 24 });
    expect(seen.map((s) => [s.url.searchParams.get("pageNum"), s.url.searchParams.get("pageSize"), s.url.searchParams.get("countryCode")])).toEqual([
      ["1", "200", "ES"],
      ["2", "200", "ES"],
      ["3", "200", "ES"],
    ]);
    expect(seen.every((s) => !s.url.searchParams.has("categoryId") && !s.url.searchParams.has("productNameEn"))).toBe(true);
    expect(page.items).toHaveLength(24);
    expect(page.items.some((p) => p.title.startsWith("Pet"))).toBe(false);
    expect(page.hasMore).toBe(true);
  });

  test("búsqueda y paginación locales, sin volver a llamar a CJ", async () => {
    const { a, seen } = adapter((_path, url) => cjList(url));
    await a.listProducts();
    const calls = seen.length;
    // 300 curados: 150 "Vase Glass Wide", 150 "Photo Frame Wood".
    const vases = await a.listProducts({ query: "wide VASE", pageSize: 100, page: 2 });
    expect(vases.items).toHaveLength(50);
    expect(vases.items.every((p) => p.title.startsWith("Vase Glass Wide"))).toBe(true);
    expect(vases.hasMore).toBe(false);
    expect((await a.listProducts({ query: "pet" })).items).toHaveLength(0);
    expect(seen.length).toBe(calls);
  });

  test("el índice caduca a las 6 h; dos peticiones a la vez lo construyen una sola vez", async () => {
    const { a, seen, time } = adapter((_path, url) => cjList(url));
    await Promise.all([a.listProducts(), a.listProducts({ query: "vase" })]);
    expect(seen.length).toBe(3);
    time.advance(6 * 60 * 60_000);
    await a.listProducts();
    expect(seen.length).toBe(6);
  });

  test("quitar el filtro o pedir una categoría concreta usa la consulta directa", async () => {
    const { a, seen } = adapter((_path, url) => cjList(url));
    await a.listProducts({ curatedOnly: false, query: "pet" });
    expect(seen[0].url.searchParams.get("productNameEn")).toBe("pet");
    await a.listProducts({ category: PET });
    expect(seen[1].url.searchParams.get("categoryId")).toBe(PET);
    expect(seen.length).toBe(2);
  });

  test("si falla a medias no se guarda un índice parcial", async () => {
    let fail = true;
    const { a, index } = adapter((_path, url) => (fail && url.searchParams.get("pageNum") === "2" ? json({ code: 1600300, result: false }) : cjList(url)));
    await expect(a.listProducts()).rejects.toMatchObject({ code: "invalid_request" });
    expect(index.value).toBeNull();
    fail = false;
    expect((await a.listProducts()).items.length).toBeGreaterThan(0);
  });
});

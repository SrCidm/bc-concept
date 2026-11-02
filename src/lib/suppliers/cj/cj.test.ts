import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseCredentialStore, type SupplierTokens, type TokenStore } from "../credentials";
import { SupplierError } from "../errors";
import { createCjAuth, parseTokens, type CjAuthState } from "./auth";
import { classifyCjResponse, createCjClient, isTokenRejected, type CjQueue, type CjRequest } from "./client";
import { CJ_ENDPOINTS } from "./endpoints";
import { createCjAdapter } from "./index";
import { cleanDescription, mapCjListItem, mapCjProduct, parseCjPrice } from "./mappers";

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

describe("adaptador completo contra una API falsa", () => {
  function adapter(routes: (path: string, url: URL, init?: RequestInit) => Response, tokens: SupplierTokens | null = validTokens(), apiKey: string | null = "k") {
    const time = fakeTime();
    const seen: { path: string; url: URL; token: string | null }[] = [];
    const mem = memoryTokens(tokens);
    const a = createCjAdapter({
      now: time.now,
      sleep: time.sleep,
      queue: newQueue(),
      authState: newState(),
      tokenStore: mem.store,
      getApiKey: async () => apiKey,
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const path = url.pathname.replace("/api2.0/v1", "");
        seen.push({ path, url, token: new Headers(init?.headers).get("CJ-Access-Token") });
        return routes(path, url, init);
      }) as typeof fetch,
    });
    return { a, seen, mem };
  }

  test("listProducts usa V1 con almacén ES y palabra clave, y calcula hasMore", async () => {
    const { a, seen } = adapter(() => json(fixture("list-v1-es-vase")));
    const page = await a.listProducts({ query: " vase ", pageSize: 3, euOnly: false });
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
    await a.listProducts({ query: "vase" });
    await a.listProducts({ query: "vase" });
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
    await a.listProducts();
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

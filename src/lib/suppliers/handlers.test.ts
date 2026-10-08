import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { INFO, IMAGES, PRODUCTS, STOCK } from "./bigbuy/__fixtures__/bigbuy";

/**
 * Prueba los Route Handlers REALES de /api/admin/** con dos sustituciones:
 *   · requireAdmin  → controlado por el test (la guarda real tiene sus propios tests)
 *   · credenciales  → almacén en memoria (no se toca Supabase)
 * y el adaptador real hablando con un servidor HTTP local que imita a BigBuy.
 */

const API_KEY = "bb_ROUND_TRIP_KEY_must_never_be_returned_9f8e7d";

let session: "none" | "admin" = "admin";
const store = new Map<string, string>();
/** Key que el "proveedor" (servidor mock) acepta. */
let acceptedKey = API_KEY;

mock.module("@/lib/auth/requireAdmin", () => ({
  // `listAdminCatalog` (que usa la ruta de productos) re-comprueba la sesión con resolveAdmin.
  resolveAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : { ok: false, status: 401, code: "unauthenticated", message: "x", email: null },
  requireAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : {
          ok: false,
          response: new Response(JSON.stringify({ error: { code: "unauthenticated" } }), {
            status: 401,
          }),
        },
}));

mock.module("@/lib/suppliers/credentials", () => ({
  resolveApiKey: async (s: string) => store.get(s) ?? process.env.BIGBUY_API_KEY ?? null,
  getCredentialStatus: async (s: string) =>
    store.has(s)
      ? { configured: true, source: "db", updatedAt: "2026-10-07T10:00:00.000Z" }
      : { configured: false, source: "none", updatedAt: null },
  setApiKey: async (s: string, k: string) => {
    store.set(s, k);
    return { updatedAt: "2026-10-07T10:00:00.000Z" };
  },
  deleteApiKey: async (s: string) => {
    store.delete(s);
  },
}));

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get("authorization");
      if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== acceptedKey) {
        return new Response("{}", { status: 401 });
      }
      switch (url.pathname) {
        case "/rest/catalog/products.json":
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
          return Response.json(PRODUCTS[0]);
        default:
          return new Response("{}", { status: 404 });
      }
    },
  });
  process.env.BIGBUY_API_BASE = `http://localhost:${server.port}`;
  Object.assign(process.env, {
    MARGIN_VAT_PCT: "21",
    MARGIN_SHIPPING_EUR: "4",
    MARGIN_STRIPE_PCT: "1.5",
    MARGIN_STRIPE_FIXED_EUR: "0.25",
    MARGIN_RETURNS_BUFFER_PCT: "3",
    MARGIN_TARGET_MIN_PCT: "15",
    MARGIN_TARGET_MAX_PCT: "35",
  });
  delete process.env.BIGBUY_API_KEY;
});

afterAll(() => {
  server.stop(true);
  delete process.env.BIGBUY_API_BASE;
  for (const k of Object.keys(process.env)) if (k.startsWith("MARGIN_")) delete process.env[k];
});

beforeEach(() => {
  session = "admin";
  acceptedKey = API_KEY;
  store.clear();
});

const ctx = (supplier: string, id?: string) => ({ params: id ? { supplier, id } : { supplier } });
const url = (path: string) => `http://localhost:3000${path}`;
const sameOrigin = { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" };

async function load() {
  const status = await import("@/app/api/admin/suppliers/[supplier]/status/route");
  const products = await import("@/app/api/admin/suppliers/[supplier]/products/route");
  const product = await import("@/app/api/admin/suppliers/[supplier]/products/[id]/route");
  const creds = await import("@/app/api/admin/suppliers/[supplier]/credentials/route");
  return { status, products, product, creds };
}

describe("401 sin sesión en TODAS las rutas (la guarda va primero)", () => {
  test("ninguna ruta responde sin admin", async () => {
    session = "none";
    const { status, products, product, creds } = await load();
    const put = new Request(url("/x"), { method: "PUT", headers: sameOrigin, body: JSON.stringify({ apiKey: API_KEY }) });
    const responses = await Promise.all([
      status.GET(new Request(url("/x")), ctx("bigbuy")),
      products.GET(new Request(url("/x")), ctx("bigbuy")),
      product.GET(new Request(url("/x")), ctx("bigbuy", "1001")),
      creds.PUT(put, ctx("bigbuy")),
      creds.DELETE(new Request(url("/x"), { method: "DELETE", headers: sameOrigin }), ctx("bigbuy")),
      // Un proveedor inexistente tampoco filtra información sin sesión.
      status.GET(new Request(url("/x")), ctx("no-existe")),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(store.size).toBe(0); // y no se escribió nada
  });
});

describe("admin autenticada", () => {
  test("sin credencial: status 200 not_configured; products 503", async () => {
    const { status, products } = await load();
    const s = await status.GET(new Request(url("/x")), ctx("bigbuy"));
    expect(s.status).toBe(200);
    expect(await s.json()).toMatchObject({ configured: false, auth: { ok: false, code: "not_configured" } });

    const p = await products.GET(new Request(url("/x")), ctx("bigbuy"));
    expect(p.status).toBe(503);
    expect((await p.json()).error.code).toBe("not_configured");
  });

  test("cj → 501 (también al escribir credenciales) y proveedor desconocido → 404", async () => {
    const { status, products, creds } = await load();
    expect((await status.GET(new Request(url("/x")), ctx("cj"))).status).toBe(501);
    expect((await products.GET(new Request(url("/x")), ctx("cj"))).status).toBe(501);
    const put = new Request(url("/x"), { method: "PUT", headers: sameOrigin, body: JSON.stringify({ apiKey: API_KEY }) });
    expect((await creds.PUT(put, ctx("cj"))).status).toBe(501);
    expect(store.size).toBe(0);
    expect((await status.GET(new Request(url("/x")), ctx("foo"))).status).toBe(404);
  });

  test("parámetros inválidos → 400 (se validan, no se 'corrigen')", async () => {
    const { products, product } = await load();
    for (const qs of ["pageSize=1000", "pageSize=0", "page=0", "page=abc", "category=a%20b", "lang=fr", `q=${"x".repeat(81)}`]) {
      const r = await products.GET(new Request(url(`/x?${qs}`)), ctx("bigbuy"));
      expect({ qs, status: r.status }).toEqual({ qs, status: 400 });
    }
    expect((await product.GET(new Request(url("/x")), ctx("bigbuy", "../etc/passwd"))).status).toBe(400);
    expect((await product.GET(new Request(url("/x?lang=zz")), ctx("bigbuy", "1001"))).status).toBe(400);
  });

  test("PUT credenciales: exige mismo origen, JSON y key válida", async () => {
    const { creds } = await load();
    const body = JSON.stringify({ apiKey: API_KEY });
    const noOrigin = new Request(url("/x"), { method: "PUT", headers: { "content-type": "application/json", host: "localhost:3000" }, body });
    expect((await creds.PUT(noOrigin, ctx("bigbuy"))).status).toBe(400);
    const crossOrigin = new Request(url("/x"), { method: "PUT", headers: { ...sameOrigin, origin: "https://evil.example" }, body });
    expect((await creds.PUT(crossOrigin, ctx("bigbuy"))).status).toBe(400);
    const notJson = new Request(url("/x"), { method: "PUT", headers: { ...sameOrigin, "content-type": "text/plain" }, body });
    expect((await creds.PUT(notJson, ctx("bigbuy"))).status).toBe(400);
    for (const bad of [{ apiKey: "corta" }, { apiKey: "con espacios dentro de la key" }, { apiKey: 123 }, {}]) {
      const r = await creds.PUT(new Request(url("/x"), { method: "PUT", headers: sameOrigin, body: JSON.stringify(bad) }), ctx("bigbuy"));
      expect(r.status).toBe(400);
    }
    expect(store.size).toBe(0);
  });

  test("flujo completo: guardar key → status → productos con coste y margen → borrar", async () => {
    const { status, products, product, creds } = await load();

    const put = await creds.PUT(
      new Request(url("/x"), { method: "PUT", headers: sameOrigin, body: JSON.stringify({ apiKey: ` ${API_KEY} ` }) }),
      ctx("bigbuy")
    );
    expect(put.status).toBe(200);
    expect(put.headers.get("cache-control")).toBe("no-store");
    const putText = await put.text();
    expect(JSON.parse(putText)).toMatchObject({ supplier: "bigbuy", configured: true, source: "db" });
    expect(putText).not.toContain(API_KEY); // la key NUNCA vuelve en la respuesta

    const s = await status.GET(new Request(url("/x")), ctx("bigbuy"));
    const sText = await s.text();
    expect(JSON.parse(sText)).toMatchObject({ configured: true, auth: { ok: true } });
    expect(sText).not.toContain(API_KEY);

    const list = await products.GET(new Request(url("/x?pageSize=5")), ctx("bigbuy"));
    expect(list.status).toBe(200);
    const listText = await list.text();
    expect(listText).not.toContain(API_KEY);
    const page = JSON.parse(listText);
    expect(page.items.map((p: { supplierProductId: string }) => p.supplierProductId)).toEqual(["1001", "1005"]);
    // DTO admin: lleva coste y margen derivado (a propósito, tras requireAdmin).
    expect(page.items[0].cost).toEqual({ amount: 18.5, currency: "EUR" });
    expect(page.items[0].margin.netMargin).toBeGreaterThan(0);
    expect(page.items[0].marginReason).toBeNull();

    const one = await product.GET(new Request(url("/x")), ctx("bigbuy", "1001"));
    expect(one.status).toBe(200);
    expect((await one.json()).cost.amount).toBe(18.5);
    expect((await product.GET(new Request(url("/x")), ctx("bigbuy", "9999"))).status).toBe(404);

    const del = await creds.DELETE(new Request(url("/x"), { method: "DELETE", headers: sameOrigin }), ctx("bigbuy"));
    expect(await del.json()).toMatchObject({ configured: false });
    expect((await products.GET(new Request(url("/x")), ctx("bigbuy"))).status).toBe(503);
  });

  test("key rechazada por el proveedor → 502 genérico y status unauthorized, sin filtrar detalles", async () => {
    const { status, products, creds } = await load();
    acceptedKey = "la-unica-key-valida-del-proveedor"; // distinta de la que se guarda
    await creds.PUT(
      new Request(url("/x"), { method: "PUT", headers: sameOrigin, body: JSON.stringify({ apiKey: API_KEY }) }),
      ctx("bigbuy")
    );

    const s = await status.GET(new Request(url("/x")), ctx("bigbuy"));
    expect(await s.json()).toMatchObject({ configured: true, auth: { ok: false, code: "unauthorized" } });

    const r = await products.GET(new Request(url("/x")), ctx("bigbuy"));
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(JSON.parse(text).error.code).toBe("unauthorized");
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(acceptedKey);
  });

  test("proveedor caído → 502/504 genérico (sin host ni error crudo)", async () => {
    const { products } = await load();
    store.set("bigbuy", API_KEY);
    acceptedKey = API_KEY;
    const previous = process.env.BIGBUY_API_BASE;
    server.stop(true); // el proveedor "desaparece"
    try {
      const r = await products.GET(new Request(url("/x")), ctx("bigbuy"));
      expect([502, 504]).toContain(r.status);
      const text = await r.text();
      expect(text).not.toContain("localhost");
      expect(text).not.toContain(API_KEY);
    } finally {
      process.env.BIGBUY_API_BASE = previous;
    }
  });
});

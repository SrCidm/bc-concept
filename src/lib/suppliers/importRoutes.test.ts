import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Rutas REALES de importación (/api/admin/suppliers/[supplier]/import[/preview])
 * a través del adaptador REAL sobre el MOCK de BigBuy. Con el mock activo el
 * guardado es una simulación: estos tests no pueden escribir en ninguna BD.
 * Solo se sustituye `requireAdmin`/`resolveAdmin` (la guarda real tiene sus tests).
 */

let session: "none" | "admin" = "admin";

mock.module("@/lib/auth/requireAdmin", () => ({
  resolveAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : { ok: false, status: 401, code: "unauthenticated", message: "x", email: null },
  requireAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : {
          ok: false,
          response: new Response(JSON.stringify({ error: { code: "unauthenticated" } }), { status: 401 }),
        },
}));

const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ["BIGBUY_MOCK", "BIGBUY_MOCK_FAIL", "NODE_ENV"]) saved[k] = process.env[k];
  process.env.BIGBUY_MOCK = "1";
  delete process.env.BIGBUY_MOCK_FAIL;
  (process.env as Record<string, string>).NODE_ENV = "test";
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  session = "admin";
});

const ctx = (supplier: string) => ({ params: { supplier } });
const url = (path: string) => `http://localhost:3000${path}`;
const same = { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" };
const post = (body: unknown, headers: Record<string, string> = same) =>
  new Request(url("/x"), { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

async function load() {
  const save = await import("@/app/api/admin/suppliers/[supplier]/import/route");
  const preview = await import("@/app/api/admin/suppliers/[supplier]/import/preview/route");
  return { save, preview };
}

const ID = "20001"; // producto del mock con stock en almacén UE explícito

describe("401 sin sesión: la guarda va primero", () => {
  test("ninguna ruta responde ni toca nada sin admin", async () => {
    session = "none";
    const { save, preview } = await load();
    const rs = await Promise.all([
      save.POST(post({ supplierProductId: ID, priceRetail: 99.9 }), ctx("bigbuy")),
      preview.POST(post({ supplierProductId: ID }), ctx("bigbuy")),
      // Ni siquiera con proveedor inexistente o sin Origin se filtra nada.
      save.POST(post({}, { "content-type": "application/json" }), ctx("no-existe")),
    ]);
    expect(rs.map((r) => r.status)).toEqual([401, 401, 401]);
  });
});

describe("preview", () => {
  test("200 con el producto, el coste (solo admin) y la guarda calculada en el servidor; no-store", async () => {
    const { preview } = await load();
    const r = await preview.POST(post({ supplierProductId: ID, priceRetail: 99.9 }), ctx("bigbuy"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const d = await r.json();
    expect(d.simulated).toBe(true); // mock activo
    expect(d.product.supplierProductId).toBe(ID);
    expect(d.product.cost.currency).toBe("EUR");
    expect(d.product.cost.amount).toBeGreaterThan(0);
    expect(d.check.price).toBe(99.9);
    expect(typeof d.check.netMarginPct).toBe("number");
    expect(d.check.minPct).toBe(15);
    expect(d.alreadyImported).toBeNull();
  });

  test("producto inexistente → 404 con solo el código", async () => {
    const { preview } = await load();
    const r = await preview.POST(post({ supplierProductId: "99999999" }), ctx("bigbuy"));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: { code: "not_found" } });
  });
});

describe("guardar (simulación con el mock)", () => {
  test("margen correcto → 200 simulado: nada escrito", async () => {
    const { save } = await load();
    const r = await save.POST(post({ supplierProductId: ID, priceRetail: 249.9 }), ctx("bigbuy"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ simulated: true, persisted: false, created: false, status: "draft", forced: false });
  });

  test("por debajo del mínimo SIN confirmar → 422 margin_below_min con el desglose", async () => {
    const { save } = await load();
    const r = await save.POST(post({ supplierProductId: ID, priceRetail: 5 }), ctx("bigbuy"));
    expect(r.status).toBe(422);
    const d = await r.json();
    expect(d.error).toEqual({ code: "margin_below_min" });
    expect(d.check.belowMin).toBe(true);
    expect(d.check.loss).toBe(true);
    expect(d.check.minPrice).toBeGreaterThan(5);
  });

  test("con confirmación explícita pasa (forced:true), pero sigue siendo simulación", async () => {
    const { save } = await load();
    const r = await save.POST(post({ supplierProductId: ID, priceRetail: 5, confirmBelowMargin: true }), ctx("bigbuy"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ simulated: true, persisted: false, forced: true });
  });

  test("el coste enviado por el cliente se ignora: la guarda usa el del proveedor", async () => {
    const { save } = await load();
    const r = await save.POST(
      post({ supplierProductId: ID, priceRetail: 5, cost: 0.01, priceCost: 0.01, status: "active" }),
      ctx("bigbuy")
    );
    expect(r.status).toBe(422); // con coste 0,01 habría margen: no cuela
  });
});

describe("endurecimiento de las rutas", () => {
  test("Origin de otro sitio → 400 (CSRF)", async () => {
    const { save, preview } = await load();
    const evil = { ...same, origin: "https://evil.example" };
    expect((await save.POST(post({ supplierProductId: ID, priceRetail: 99.9 }, evil), ctx("bigbuy"))).status).toBe(400);
    expect((await preview.POST(post({ supplierProductId: ID }, evil), ctx("bigbuy"))).status).toBe(400);
  });

  test("cuerpo no JSON, vacío, enorme o mal formado → 400 sin eco", async () => {
    const { save } = await load();
    const cases: Array<[string, Record<string, string>]> = [
      ["{", same],
      ["", same],
      [JSON.stringify({ supplierProductId: ID, priceRetail: 10, pad: "x".repeat(5_000) }), same],
      [JSON.stringify({ supplierProductId: ID, priceRetail: 10 }), { ...same, "content-type": "text/plain" }],
    ];
    for (const [body, headers] of cases) {
      const r = await save.POST(post(body, headers), ctx("bigbuy"));
      expect(r.status).toBe(400);
      expect(JSON.stringify(await r.json())).not.toContain("xxxx");
    }
  });

  test("entradas hostiles → 400 invalid_request", async () => {
    const { save } = await load();
    for (const bad of [
      { supplierProductId: "../x", priceRetail: 10 },
      { supplierProductId: ID, priceRetail: -1 },
      { supplierProductId: ID, priceRetail: 10.123 },
      { supplierProductId: ID, priceRetail: 10, category: "armas" },
      { supplierProductId: ID },
      [1, 2, 3],
    ]) {
      const r = await save.POST(post(bad), ctx("bigbuy"));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: { code: "invalid_request" } });
    }
  });

  test("proveedor desconocido → 404; CJ (sin migrar) → 501", async () => {
    const { save, preview } = await load();
    expect((await save.POST(post({ supplierProductId: ID, priceRetail: 99.9 }), ctx("nope"))).status).toBe(404);
    expect((await save.POST(post({ supplierProductId: ID, priceRetail: 99.9 }), ctx("cj"))).status).toBe(501);
    expect((await preview.POST(post({ supplierProductId: ID }), ctx("cj"))).status).toBe(501);
  });

  test("error del proveedor simulado → código sin detalles", async () => {
    process.env.BIGBUY_MOCK_FAIL = "unauthorized";
    try {
      const { save } = await load();
      const r = await save.POST(post({ supplierProductId: "20002", priceRetail: 99.9 }), ctx("bigbuy"));
      expect([502, 429, 503]).toContain(r.status);
      expect(await r.json()).toEqual({ error: { code: "unauthorized" } });
    } finally {
      delete process.env.BIGBUY_MOCK_FAIL;
    }
  });
});

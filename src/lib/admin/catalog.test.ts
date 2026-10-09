import { describe, expect, test } from "bun:test";
import type { AdminDecision } from "@/lib/auth/requireAdmin";
import type { MarginParams } from "@/lib/pricing/margin";
import { SupplierError } from "@/lib/suppliers/errors";
import type { ListProductsParams, ProductPage, SupplierAdapter, SupplierProduct } from "@/lib/suppliers/types";
import { listAdminCatalog } from "./catalog";

/**
 * listAdminCatalog es lo que trae el COSTE. Debe exigir la sesión él mismo:
 * ni el layout (no se re-ejecuta en navegación cliente) ni quien lo llame son
 * una garantía. Estos tests lo fijan con un adaptador ESPÍA: sin sesión de
 * admin, ni siquiera se construye el adaptador.
 */

const ADMIN: AdminDecision = { ok: true, userId: "u1", email: "yosra@bc.com" };
const NO_SESSION: AdminDecision = { ok: false, status: 401, code: "unauthenticated", message: "x", email: null };
const NOT_ADMIN: AdminDecision = { ok: false, status: 403, code: "forbidden", message: "x", email: "intruso@bc.com" };

const QUERY = { page: 1, pageSize: 24, lang: "es" as const, euOnly: true, inStockOnly: true };

const PARAMS: MarginParams = {
  vatPct: 21, shippingCost: 4, stripePct: 1.5, stripeFixed: 0.25,
  returnsBufferPct: 3, targetMinPct: 15, targetMaxPct: 35,
};

const PRODUCT: SupplierProduct = {
  supplier: "bigbuy", supplierProductId: "1001", sku: "S1001", ean: null,
  title: "Lámpara de mesa", description: null, images: [], category: null, weightKg: 1,
  cost: { amount: 18.5, currency: "EUR" },
  suggestedRetail: { amount: 59.9, currency: "EUR" },
  stock: { total: 25, eu: [{ warehouse: "ES", quantity: 25, minHandlingDays: 1, maxHandlingDays: 2 }], euTotal: 25 },
  delivery: { minDays: 1, maxDays: 2 },
  variants: [],
};

/** Espía: registra TODA interacción con el proveedor, en orden. */
function spyEnv(opts: { decision?: AdminDecision | "throw"; listProducts?: () => Promise<ProductPage> } = {}) {
  const calls: string[] = [];
  const seen: ListProductsParams[] = [];
  const adapter: SupplierAdapter = {
    id: "bigbuy",
    async auth() {
      calls.push("adapter.auth");
      return { ok: true };
    },
    async listProducts(params) {
      calls.push("adapter.listProducts");
      seen.push(params ?? {});
      return opts.listProducts
        ? opts.listProducts()
        : { items: [PRODUCT], page: 1, pageSize: 24, hasMore: false, fetched: 1 };
    },
    async getProduct() {
      calls.push("adapter.getProduct");
      return null;
    },
  };
  const deps = {
    resolve: async () => {
      calls.push("resolve");
      if (opts.decision === "throw") throw new Error("auth down");
      return opts.decision ?? ADMIN;
    },
    getAdapter: () => {
      calls.push("getAdapter");
      return adapter;
    },
    getMarginParams: async () => PARAMS,
    isMock: () => false,
  };
  return { calls, seen, deps };
}

describe("listAdminCatalog exige la sesión él mismo (auto-guardado)", () => {
  test("SIN SESIÓN: devuelve 'unauthenticated' y no construye NI invoca el adaptador", async () => {
    const { calls, deps } = spyEnv({ decision: NO_SESSION });
    const r = await listAdminCatalog(QUERY, deps);
    expect(r).toEqual({ ok: false, code: "unauthenticated" });
    expect(calls).toEqual(["resolve"]); // solo la comprobación de sesión
    expect(calls).not.toContain("getAdapter");
    expect(calls).not.toContain("adapter.listProducts");
  });

  test("SESIÓN QUE NO ES ADMIN: devuelve 'forbidden' sin tocar el adaptador", async () => {
    const { calls, deps } = spyEnv({ decision: NOT_ADMIN });
    const r = await listAdminCatalog(QUERY, deps);
    expect(r).toEqual({ ok: false, code: "forbidden" });
    expect(calls).toEqual(["resolve"]);
  });

  test("si la comprobación de sesión LANZA, se deniega (fail-closed) sin tocar el adaptador", async () => {
    const { calls, deps } = spyEnv({ decision: "throw" });
    const r = await listAdminCatalog(QUERY, deps);
    expect(r).toEqual({ ok: false, code: "unauthenticated" });
    expect(calls).toEqual(["resolve"]);
  });

  test("el resultado de una denegación no lleva datos ni mensajes del proveedor", async () => {
    const { deps } = spyEnv({ decision: NO_SESSION });
    const text = JSON.stringify(await listAdminCatalog(QUERY, deps));
    expect(text).not.toMatch(/cost|Lámpara|apiKey|margin/i);
  });

  test("con admin: primero la sesión, después el adaptador (orden garantizado)", async () => {
    const { calls, deps } = spyEnv();
    await listAdminCatalog(QUERY, deps);
    expect(calls).toEqual(["resolve", "getAdapter", "adapter.listProducts"]);
  });
});

describe("listAdminCatalog con admin", () => {
  test("devuelve el DTO admin con coste y margen derivado, y pasa los filtros al adaptador", async () => {
    const { seen, deps } = spyEnv();
    const r = await listAdminCatalog({ ...QUERY, page: 2, query: "lampara", euOnly: false }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("live");
    expect(r.data.items[0].cost).toEqual({ amount: 18.5, currency: "EUR" });
    expect(r.data.items[0].margin).not.toBeNull();
    expect(seen[0]).toMatchObject({ page: 2, query: "lampara", euOnly: false, inStockOnly: true, lang: "es" });
  });

  test("sin parámetros de margen: margin null con motivo (el coste sigue)", async () => {
    const { deps } = spyEnv();
    const r = await listAdminCatalog(QUERY, { ...deps, getMarginParams: async () => null });
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.items[0].margin).toBeNull();
    expect(r.data.items[0].marginReason).toBe("params_not_configured");
    expect(r.data.items[0].cost.amount).toBe(18.5);
  });

  test("source refleja si se usa el mock", async () => {
    const { deps } = spyEnv();
    const r = await listAdminCatalog(QUERY, { ...deps, isMock: () => true });
    expect(r.ok && r.source).toBe("mock");
  });

  test("errores del proveedor → solo el CÓDIGO (sin mensajes, URLs ni cuerpos)", async () => {
    for (const code of ["not_configured", "unauthorized", "rate_limited", "timeout", "upstream", "bad_response"] as const) {
      const { deps } = spyEnv({ listProducts: async () => { throw new SupplierError(code); } });
      expect(await listAdminCatalog(QUERY, deps)).toEqual({ ok: false, code });
    }
  });

  test("un error inesperado no se filtra: se devuelve 'upstream' genérico", async () => {
    const { deps } = spyEnv({
      listProducts: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:443 key=bb_SECRET");
      },
    });
    const r = await listAdminCatalog(QUERY, deps);
    expect(r).toEqual({ ok: false, code: "upstream" });
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|SECRET|10\.0\.0\.5/);
  });
});

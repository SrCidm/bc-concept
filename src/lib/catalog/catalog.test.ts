import { describe, expect, test } from "bun:test";
import { STORE_CATEGORIES, isStoreCategory } from "./categories";
import * as adminTypes from "@/lib/admin/import.types";
import { PAGE_SIZE, catalogQuery, parseCatalogParams } from "./params";
import { getCatalogProducts } from "./products";

describe("categorías: una sola lista", () => {
  test("lighting · textiles · decor, y el admin reexporta la misma", () => {
    expect([...STORE_CATEGORIES]).toEqual(["lighting", "textiles", "decor"]);
    expect(adminTypes.STORE_CATEGORIES).toBe(STORE_CATEGORIES);
    expect(adminTypes.isStoreCategory).toBe(isStoreCategory);
  });
});

describe("parseCatalogParams (?q= & ?cat= & ?page=)", () => {
  test("categoría válida; desconocida o vacía → colección completa", () => {
    expect(parseCatalogParams({ cat: "lighting" }).cat).toBe("lighting");
    expect(parseCatalogParams({ cat: " Textiles " }).cat).toBe("textiles");
    expect(parseCatalogParams({ cat: ["decor", "lighting"] }).cat).toBe("decor");
    for (const cat of [undefined, "", "deco", "sofas", "lighting'--", "__proto__", "toString"]) {
      expect(parseCatalogParams({ cat }).cat).toBeNull();
    }
  });

  test("página entera ≥ 1; inválida → 1", () => {
    expect(parseCatalogParams({ page: "3" }).page).toBe(3);
    for (const page of [undefined, "", "0", "-2", "1.5", "abc", "99999", "1e3", " 2x"]) {
      expect(parseCatalogParams({ page }).page).toBe(1);
    }
  });

  test("q se recorta y se limita a 80 caracteres; se combina con cat y page", () => {
    expect(parseCatalogParams({ q: "  vela  ", cat: "decor", page: "2" })).toEqual({ q: "vela", cat: "decor", page: 2 });
    expect(parseCatalogParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});

describe("catalogQuery (URL canónica)", () => {
  test("omite los valores por defecto y conserva q y cat", () => {
    expect(catalogQuery({})).toEqual({});
    expect(catalogQuery({ q: "", cat: null, page: 1 })).toEqual({});
    expect(catalogQuery({ q: "vela", cat: "decor", page: 2 })).toEqual({ q: "vela", cat: "decor", page: "2" });
    expect(catalogQuery({ cat: "lighting" })).toEqual({ cat: "lighting" });
  });
});

/** Cliente falso: registra la cadena de llamadas y responde lo que se le diga. */
function fakeClient(response: { data?: unknown[]; error?: { code: string } | null; count?: number | null }) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "range"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: response.data ?? [], error: response.error ?? null, count: response.count ?? null });
  const client = {
    from: (t: string) => (calls.push(["from", t]), builder),
    rpc: (fn: string, args: unknown, opts: unknown) => (calls.push(["rpc", fn, args, opts]), builder),
  };
  return { calls, client: () => client as unknown as ReturnType<typeof import("@/lib/supabase/server").createClient> };
}

const row = (i: number) => ({
  id: `p${i}`, slug: `p-${i}`, title: `Pieza ${i}`, description: null, price_retail: "39.90", currency: "EUR",
  images: [], category: "decor", inventory: 3, warehouse: "ES", delivery_min_days: 3, delivery_max_days: 7,
  created_at: "2026-10-01T00:00:00Z",
});

describe("getCatalogProducts: filtro y paginación sobre la misma consulta", () => {
  test("colección completa, página 1: vista pública, sin filtro, primeras 24", async () => {
    const f = fakeClient({ data: [row(1)], count: 1 });
    const r = await getCatalogProducts({ q: "", cat: null, page: 1 }, { client: f.client });
    expect(f.calls[0]).toEqual(["from", "products_public"]);
    expect(f.calls.find((c) => c[0] === "eq")).toBeUndefined();
    expect(f.calls.at(-1)).toEqual(["range", 0, PAGE_SIZE - 1]);
    expect(r).toMatchObject({ ok: true, page: 1, total: 1, totalPages: 1 });
  });

  test("categoría + página 3: filtra por category y desplaza 48", async () => {
    const f = fakeClient({ data: [row(1)], count: 60 });
    const r = await getCatalogProducts({ q: "", cat: "textiles", page: 3 }, { client: f.client });
    expect(f.calls).toContainEqual(["eq", "category", "textiles"]);
    expect(f.calls.at(-1)).toEqual(["range", 48, 71]);
    expect(r).toMatchObject({ ok: true, page: 3, total: 60, totalPages: 3 });
  });

  test("búsqueda + categoría: RPC con conteo, mismo filtro y rango", async () => {
    const f = fakeClient({ data: [row(1), row(2)], count: 2 });
    const r = await getCatalogProducts({ q: "vela", cat: "decor", page: 1 }, { client: f.client });
    expect(f.calls[0]).toEqual(["rpc", "search_products_public", { q: "vela", max_rows: 48 }, { count: "exact" }]);
    expect(f.calls).toContainEqual(["eq", "category", "decor"]);
    expect(f.calls.at(-1)).toEqual(["range", 0, 23]);
    expect(r.ok && r.products.map((p) => p.slug)).toEqual(["p-1", "p-2"]);
  });

  test("página fuera de rango (PGRST103) → lista vacía, no error", async () => {
    const f = fakeClient({ error: { code: "PGRST103" } });
    expect(await getCatalogProducts({ q: "", cat: null, page: 9 }, { client: f.client })).toEqual({
      ok: true, products: [], page: 9, totalPages: 0, total: 0,
    });
  });

  test("otro error → { ok: false } sin detalles (regla #8)", async () => {
    const f = fakeClient({ error: { code: "42501" } });
    expect(await getCatalogProducts({ q: "", cat: "lighting", page: 1 }, { client: f.client })).toEqual({ ok: false });
  });
});

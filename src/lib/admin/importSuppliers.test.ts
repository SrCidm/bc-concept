import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCatalogMock, isSimulatedImport } from "@/lib/suppliers/registry";
import { DEFAULT_IMPORT_SUPPLIER, importQueryString, parseImportParams } from "./importParams";
import { IMPORT_SUPPLIERS, importSupplierOptions } from "./importSuppliers";

describe("simulación por proveedor", () => {
  test("CJ: guardar es simulación salvo CJ_IMPORT_ENABLED=1 exacto", () => {
    expect(isSimulatedImport("cj", {})).toBe(true);
    for (const v of ["", "0", "true", "yes", "1 "]) expect(isSimulatedImport("cj", { CJ_IMPORT_ENABLED: v })).toBe(true);
    expect(isSimulatedImport("cj", { CJ_IMPORT_ENABLED: "1" })).toBe(false);
  });

  test("el mock de BigBuy no afecta a CJ, y al revés", () => {
    const preview = { BIGBUY_MOCK: "1", VERCEL_ENV: "preview", NODE_ENV: "production" };
    expect(isCatalogMock("bigbuy", preview)).toBe(true);
    expect(isCatalogMock("cj", preview)).toBe(false);
    expect(isSimulatedImport("bigbuy", preview)).toBe(true);
    expect(isSimulatedImport("bigbuy", { CJ_IMPORT_ENABLED: "1", NODE_ENV: "production" })).toBe(false);
    // Activar la importación de CJ no apaga la simulación del mock de BigBuy.
    expect(isSimulatedImport("bigbuy", { ...preview, CJ_IMPORT_ENABLED: "1" })).toBe(true);
  });
});

describe("?supplier= en /admin/import", () => {
  test("CJ por defecto, sin parámetro en la URL", () => {
    expect(DEFAULT_IMPORT_SUPPLIER).toBe("cj");
    const r = parseImportParams({ q: "vase" });
    if (!r.ok) throw new Error("no ok");
    expect(r.ui.supplier).toBe("cj");
    expect(r.query.supplier).toBe("cj");
    expect(importQueryString(r.ui)).toBe("q=vase");
  });

  test("BigBuy se conserva en los enlaces", () => {
    const r = parseImportParams({ supplier: "bigbuy", q: "vase", page: "2" });
    if (!r.ok) throw new Error("no ok");
    expect(r.ui.supplier).toBe("bigbuy");
    expect(importQueryString(r.ui)).toBe("supplier=bigbuy&q=vase&page=2");
  });

  test("proveedor desconocido: petición no válida", () => {
    expect(parseImportParams({ supplier: "aliexpress" })).toEqual({ ok: false });
  });

  test("CJ ignora los filtros: siempre solo UE y con stock", () => {
    const r = parseImportParams({ eu: "0", stock: "0" });
    if (!r.ok) throw new Error("no ok");
    expect(r.query).toMatchObject({ euOnly: true, inStockOnly: true });
    expect(importQueryString(r.ui)).toBe("");
  });

  test("BigBuy mantiene sus filtros", () => {
    const r = parseImportParams({ supplier: "bigbuy", eu: "0" });
    if (!r.ok) throw new Error("no ok");
    expect(r.query.euOnly).toBe(false);
    expect(importQueryString(r.ui)).toBe("supplier=bigbuy&eu=0");
  });
});

describe("selector de proveedor", () => {
  const status = (configured: Record<string, boolean>) => async (id: string) => ({ configured: configured[id] ?? false });

  test("CJ primero; sin credencial = no conectado", async () => {
    expect(IMPORT_SUPPLIERS[0]).toBe("cj");
    expect(await importSupplierOptions({ status: status({ cj: true }), isMock: () => false })).toEqual([
      { id: "cj", connected: true },
      { id: "bigbuy", connected: false },
    ]);
  });

  test("con el mock, BigBuy tiene catálogo de ejemplo", async () => {
    const [cj, bigbuy] = await importSupplierOptions({ status: status({}), isMock: () => true });
    expect(cj).toEqual({ id: "cj", connected: false });
    expect(bigbuy).toEqual({ id: "bigbuy", connected: true });
  });

  test("si falla la lectura cuenta como no conectado", async () => {
    const r = await importSupplierOptions({
      status: async () => {
        throw new Error("bd caída");
      },
      isMock: () => false,
    });
    expect(r.every((o) => !o.connected)).toBe(true);
  });
});

describe("tiempo máximo en Vercel", () => {
  const SRC = join(import.meta.dir, "../..");
  for (const file of [
    "app/[locale]/(admin)/admin/(panel)/import/page.tsx",
    "app/api/admin/suppliers/[supplier]/products/route.ts",
    "app/api/admin/suppliers/[supplier]/status/route.ts",
    "app/api/admin/suppliers/[supplier]/import/route.ts",
    "app/api/admin/suppliers/[supplier]/import/preview/route.ts",
  ]) {
    test(`${file} declara maxDuration`, () => {
      expect(readFileSync(join(SRC, file), "utf8")).toMatch(/export const maxDuration = 60;/);
    });
  }
});

describe("mensajes del panel", () => {
  test("solo el aviso del mock nombra a BigBuy", () => {
    const es = JSON.parse(readFileSync(join(import.meta.dir, "../../../messages/es.json"), "utf8"));
    const { mock, suppliers, ...rest } = es.admin.import;
    expect(JSON.stringify(rest)).not.toContain("BigBuy");
    expect(JSON.stringify(mock)).toContain("BigBuy");
    expect(suppliers.bigbuy).toBe("BigBuy");
  });
});

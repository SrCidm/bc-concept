import { afterEach, describe, expect, test } from "bun:test";
import { toAdminPageDTO } from "../../dto";
import { createMockBigBuyAdapter, getMockFailure, getSupplierAdapter, isMockEnabled } from "../../registry";
import { MOCK_PRODUCT_COUNT, MOCK_PRODUCTS } from "./catalog";

/**
 * El mock habla con el adaptador REAL (solo `fetch` es falso): estos tests
 * comprueban que mappers, filtro UE, paginación y DTO funcionan sobre él, y que
 * el mock NO existe en producción.
 */

const DEV = { BIGBUY_MOCK: "1", NODE_ENV: "development" } as const;
const adapter = () => createMockBigBuyAdapter({ ...DEV });

describe("guarda de producción del mock", () => {
  test("solo se activa con BIGBUY_MOCK=1 fuera de producción", () => {
    expect(isMockEnabled({ BIGBUY_MOCK: "1", NODE_ENV: "development" })).toBe(true);
    expect(isMockEnabled({ BIGBUY_MOCK: "1", NODE_ENV: "test" })).toBe(true);
    expect(isMockEnabled({ BIGBUY_MOCK: "1", NODE_ENV: "production" })).toBe(false);
    expect(isMockEnabled({ BIGBUY_MOCK: "true", NODE_ENV: "development" })).toBe(false);
    expect(isMockEnabled({ BIGBUY_MOCK: "0", NODE_ENV: "development" })).toBe(false);
    expect(isMockEnabled({ NODE_ENV: "development" })).toBe(false);
  });

  test("en producción BIGBUY_MOCK_FAIL también se ignora", () => {
    expect(getMockFailure({ BIGBUY_MOCK: "1", BIGBUY_MOCK_FAIL: "unauthorized", NODE_ENV: "production" })).toBeNull();
    expect(getMockFailure({ ...DEV, BIGBUY_MOCK_FAIL: "unauthorized" })).toBe("unauthorized");
    expect(getMockFailure({ ...DEV, BIGBUY_MOCK_FAIL: "otra-cosa" })).toBeNull();
  });
});

describe("registro: el adaptador depende del modo", () => {
  const prev = { ...process.env };
  afterEach(() => {
    for (const k of ["BIGBUY_MOCK", "BIGBUY_MOCK_FAIL", "NODE_ENV"] as const) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  test("con BIGBUY_MOCK=1 sirve datos de ejemplo y el adaptador cambia con el modo (sin llamar al proveedor real)", async () => {
    process.env.BIGBUY_MOCK = "1";
    process.env.NODE_ENV = "development";
    const mockAdapter = getSupplierAdapter("bigbuy");
    const page = await mockAdapter.listProducts({ pageSize: 5 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(getSupplierAdapter("bigbuy")).toBe(mockAdapter); // misma caché mientras el modo no cambie

    // En producción BIGBUY_MOCK se ignora: se construye otro adaptador (el real). No se invoca: no hay red en tests.
    process.env.NODE_ENV = "production";
    expect(getSupplierAdapter("bigbuy")).not.toBe(mockAdapter);
  });
});

describe("mock → adaptador real → DTO", () => {
  test("pagina de forma coherente y es determinista", async () => {
    const a = await adapter().listProducts({ page: 1, pageSize: 10, euOnly: false, inStockOnly: false });
    const b = await adapter().listProducts({ page: 1, pageSize: 10, euOnly: false, inStockOnly: false });
    expect(a.fetched).toBe(10);
    expect(a.hasMore).toBe(true);
    expect(a.items.map((i) => i.supplierProductId)).toEqual(b.items.map((i) => i.supplierProductId));
    const last = await adapter().listProducts({ page: 5, pageSize: 10, euOnly: false, inStockOnly: false });
    expect(last.fetched).toBe(MOCK_PRODUCT_COUNT - 40);
    expect(last.hasMore).toBe(false);
  });

  test("descarta los productos sin precio mayorista (fetched > resultados)", async () => {
    const all = await adapter().listProducts({ page: 1, pageSize: 100, euOnly: false, inStockOnly: false });
    expect(all.fetched).toBe(MOCK_PRODUCT_COUNT);
    expect(all.items.length).toBe(MOCK_PRODUCT_COUNT - MOCK_PRODUCTS.filter((p) => p.wholesalePrice === undefined).length);
  });

  test("los filtros UE / stock cambian el resultado y nunca cuelan stock fuera de la UE", async () => {
    const base = { page: 1, pageSize: 100 };
    const everything = await adapter().listProducts({ ...base, euOnly: false, inStockOnly: false });
    const inStock = await adapter().listProducts({ ...base, euOnly: false, inStockOnly: true });
    const eu = await adapter().listProducts({ ...base, euOnly: true, inStockOnly: true });
    expect(inStock.items.length).toBeLessThan(everything.items.length);
    expect(eu.items.length).toBeLessThanOrEqual(inStock.items.length);
    expect(eu.items.every((i) => i.stock.euTotal > 0)).toBe(true);
    // Hay productos solo con stock fuera de la UE (para ver el caso en el panel).
    expect(inStock.items.some((i) => i.stock.total > 0 && i.stock.euTotal === 0)).toBe(true);
  });

  test("la búsqueda por texto ignora tildes y mayúsculas", async () => {
    const r = await adapter().listProducts({ page: 1, pageSize: 100, query: "LAMPARA", euOnly: false, inStockOnly: false });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => /l[aá]mpara/i.test(i.title))).toBe(true);
    const none = await adapter().listProducts({ page: 1, pageSize: 100, query: "zzzz", euOnly: false, inStockOnly: false });
    expect(none.items).toHaveLength(0);
  });

  test("las imágenes del mock (/admin-mock/…) pasan el filtro; las http:// no", async () => {
    const r = await adapter().listProducts({ page: 1, pageSize: 100, euOnly: false, inStockOnly: false });
    const urls = r.items.flatMap((i) => i.images);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith("/admin-mock/"))).toBe(true);
    expect(r.items.some((i) => i.images.length === 0)).toBe(true); // hay productos sin imagen
  });

  test("el DTO admin lleva coste en EUR", async () => {
    const r = await adapter().listProducts({ page: 1, pageSize: 24 });
    const dto = toAdminPageDTO(r, null);
    expect(dto.items.every((i) => i.cost.currency === "EUR" && i.cost.amount > 0)).toBe(true);
  });

  test("getProduct devuelve variantes", async () => {
    const p = await adapter().getProduct("20002");
    expect(p?.variants.length).toBe(2);
    expect(await adapter().getProduct("99999999")).toBeNull();
  });
});

describe("fallos simulados", () => {
  test.each(["unauthorized", "rate_limited", "upstream"] as const)("BIGBUY_MOCK_FAIL=%s → SupplierError con ese tipo", async (fail) => {
    const a = createMockBigBuyAdapter({ ...DEV, BIGBUY_MOCK_FAIL: fail });
    const expected = { unauthorized: "unauthorized", rate_limited: "rate_limited", upstream: "upstream" }[fail];
    await expect(a.listProducts({})).rejects.toMatchObject({ code: expected });
  });

  test("not_configured → el adaptador no tiene key", async () => {
    const a = createMockBigBuyAdapter({ ...DEV, BIGBUY_MOCK_FAIL: "not_configured" });
    await expect(a.listProducts({})).rejects.toMatchObject({ code: "not_configured" });
  });
});

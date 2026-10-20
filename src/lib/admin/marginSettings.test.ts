import { describe, expect, test } from "bun:test";
import type { AdminDecision } from "@/lib/auth/requireAdmin";
import { minimumPrice } from "@/lib/pricing/guard";
import { DEFAULT_MARGIN_PARAMS, createDbMarginSource, toMarginParams } from "@/lib/pricing/settings";
import type { MarginSettingsRecord, MarginSettingsStore, NewMarginSettingsRecord } from "@/lib/pricing/settingsStore";
import type { SupplierAdapter, SupplierProduct } from "@/lib/suppliers/types";
import { previewImport } from "./importProduct";
import { getMarginSettingsPanel, previewMarginSettings, saveMarginSettings, type MarginSettingsDeps } from "./marginSettings";
import type { MarginValuesDTO } from "./settings.types";

const ADMIN: AdminDecision = { ok: true, userId: "u1", email: "yosra@bc.com" };
const NO_SESSION: AdminDecision = { ok: false, status: 401, code: "unauthenticated", message: "x", email: null };
const NOT_ADMIN: AdminDecision = { ok: false, status: 403, code: "forbidden", message: "x", email: "intruso@bc.com" };

const NEW_VALUES: MarginValuesDTO = {
  returnsBufferPct: 8,
  shippingCost: 6,
  acquisitionCost: 3,
  targetMinPct: 25,
  targetMaxPct: 45,
  stripePct: 1.5,
  stripeFixed: 0.25,
};

/** Almacén en memoria de SOLO INSERCIÓN: si algo intentara otra cosa, no existe el método. */
function memoryStore(opts: { failLatest?: boolean; failInsert?: boolean; failHistory?: boolean } = {}) {
  const calls: string[] = [];
  const rows: MarginSettingsRecord[] = [];
  let clock = Date.parse("2026-10-20T10:00:00.000Z");
  const store: MarginSettingsStore = {
    async latest() {
      calls.push("latest");
      if (opts.failLatest) throw new Error("db down: secret detail");
      return rows.length ? rows[rows.length - 1] : null;
    },
    async history(limit) {
      calls.push("history");
      if (opts.failHistory) throw new Error("db down");
      return rows.slice().reverse().slice(0, limit);
    },
    async insert(row: NewMarginSettingsRecord) {
      calls.push("insert");
      if (opts.failInsert) throw new Error('violates check constraint "x" detail: secret');
      clock += 60_000;
      const rec: MarginSettingsRecord = {
        id: rows.length + 1,
        values: { ...row.values },
        createdBy: row.createdBy,
        createdAt: new Date(clock).toISOString(),
        note: row.note,
      };
      rows.push(rec);
      return rec;
    },
  };
  return { store, calls, rows };
}

function setup(opts: { decision?: AdminDecision | "throw"; store?: ReturnType<typeof memoryStore> } = {}) {
  const mem = opts.store ?? memoryStore();
  const authCalls: string[] = [];
  const source = createDbMarginSource({ store: mem.store, env: {} });
  const deps: MarginSettingsDeps = {
    resolve: async () => {
      authCalls.push("resolve");
      if (opts.decision === "throw") throw new Error("auth down");
      return opts.decision ?? ADMIN;
    },
    store: mem.store,
    source,
  };
  return { deps, mem, source, authCalls };
}

describe("auto-guardado: sin sesión de admin no se lee ni se escribe nada", () => {
  const fns = [
    ["getMarginSettingsPanel", (d: MarginSettingsDeps) => getMarginSettingsPanel(d)],
    ["previewMarginSettings", (d: MarginSettingsDeps) => previewMarginSettings(NEW_VALUES, d)],
    ["saveMarginSettings", (d: MarginSettingsDeps) => saveMarginSettings(NEW_VALUES, d)],
  ] as const;

  for (const [name, fn] of fns) {
    for (const [label, decision, code] of [
      ["sin sesión", NO_SESSION, "unauthenticated"],
      ["no admin", NOT_ADMIN, "forbidden"],
      ["la comprobación lanza", "throw", "unauthenticated"],
    ] as const) {
      test(`${name}: ${label} → ${code} y 0 accesos al almacén`, async () => {
        const { deps, mem } = setup({ decision });
        expect(await fn(deps)).toEqual({ ok: false, code });
        expect(mem.calls).toEqual([]);
      });
    }
  }
});

describe("saveMarginSettings", () => {
  test("valores válidos → UNA inserción (nunca update/delete) con created_by de la sesión", async () => {
    const { deps, mem } = setup();
    const r = await saveMarginSettings({ ...NEW_VALUES, note: "  Ajuste de octubre ", createdBy: "evil@x.com" }, deps);
    expect(r.ok).toBe(true);
    expect(mem.calls.filter((c) => c === "insert")).toHaveLength(1);
    expect(mem.calls.every((c) => ["insert", "latest", "history"].includes(c))).toBe(true);
    expect(mem.rows).toHaveLength(1);
    expect(mem.rows[0]).toMatchObject({ createdBy: "yosra@bc.com", note: "Ajuste de octubre", values: NEW_VALUES });
  });

  test("cada guardado es una fila nueva (historial); la vigente es la última", async () => {
    const { deps, mem } = setup();
    await saveMarginSettings(NEW_VALUES, deps);
    const r = await saveMarginSettings({ ...NEW_VALUES, targetMinPct: 30 }, deps);
    expect(mem.rows).toHaveLength(2);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.values.targetMinPct).toBe(30);
    expect(r.data.origin).toBe("db");
    expect(r.data.savedBy).toBe("yosra@bc.com");
  });

  test("fuera de rango → invalid_request con los CAMPOS, sin escribir y sin eco de los valores", async () => {
    const { deps, mem } = setup();
    const r = await saveMarginSettings({ ...NEW_VALUES, returnsBufferPct: 77.77, stripeFixed: 9 }, deps);
    expect(r).toEqual({ ok: false, code: "invalid_request", fields: ["returnsBufferPct", "stripeFixed"] });
    expect(mem.calls).not.toContain("insert");
    expect(JSON.stringify(r)).not.toContain("77.77");
  });

  test("objetivo < mínimo → invalid_request en targetMaxPct", async () => {
    const { deps } = setup();
    expect(await saveMarginSettings({ ...NEW_VALUES, targetMinPct: 40, targetMaxPct: 30 }, deps)).toEqual({
      ok: false,
      code: "invalid_request",
      fields: ["targetMaxPct"],
    });
  });

  test("fallo al escribir → storage_failed sin detalles de la BD", async () => {
    const { deps } = setup({ store: memoryStore({ failInsert: true }) });
    const r = await saveMarginSettings(NEW_VALUES, deps);
    expect(r).toEqual({ ok: false, code: "storage_failed" });
    expect(JSON.stringify(r)).not.toMatch(/constraint|secret/);
  });
});

describe("la guarda usa los valores nuevos en cuanto se guardan", () => {
  test("la fuente (con caché) devuelve ya los nuevos y el PVP mínimo cambia", async () => {
    const { deps, source } = setup();
    const before = await source.get(); // queda cacheado
    expect(before.targetMinPct).toBe(DEFAULT_MARGIN_PARAMS.targetMinPct);
    const minBefore = minimumPrice(20, before)!;

    await saveMarginSettings(NEW_VALUES, deps);

    const after = await source.get();
    expect(after).toEqual(toMarginParams(NEW_VALUES));
    expect(minimumPrice(20, after)!).toBeGreaterThan(minBefore);
  });

  test("el preview del MODAL de importación refleja el nuevo mínimo (sin tocar su UI)", async () => {
    const { deps, source } = setup();
    const product: SupplierProduct = {
      supplier: "bigbuy",
      supplierProductId: "1001",
      sku: "S1001",
      ean: null,
      title: "Lámpara",
      description: null,
      images: [],
      category: null,
      weightKg: 1,
      cost: { amount: 20, currency: "EUR" },
      suggestedRetail: { amount: 59.9, currency: "EUR" },
      stock: { total: 10, eu: [{ warehouse: "ES", quantity: 10, minHandlingDays: 1, maxHandlingDays: 2 }], euTotal: 10 },
      delivery: { minDays: 1, maxDays: 2 },
      variants: [],
    };
    const adapter: SupplierAdapter = {
      id: "bigbuy",
      auth: async () => ({ ok: true }),
      listProducts: async () => ({ items: [], page: 1, pageSize: 24, hasMore: false, fetched: 0 }),
      getProduct: async () => product,
    };
    const importDeps = {
      resolve: async () => ADMIN,
      getAdapter: () => adapter,
      getParams: () => source.get(),
      isMock: () => true,
      cache: new Map(),
    };

    const r1 = await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: 59.9 }, importDeps);
    await saveMarginSettings(NEW_VALUES, deps);
    const r2 = await previewImport("bigbuy", { supplierProductId: "1001", priceRetail: 59.9 }, importDeps);

    if (!r1.ok || !r2.ok) throw new Error("deberían ir bien");
    expect(r1.data.check?.minPct).toBe(15);
    expect(r2.data.check?.minPct).toBe(25);
    expect(r2.data.check?.shipping).toBe(6);
    expect(r2.data.check?.acquisition).toBe(3);
    expect(r2.data.check!.minPrice!).toBeGreaterThan(r1.data.check!.minPrice!);
  });
});

describe("getMarginSettingsPanel", () => {
  test("sin nada guardado → valores por defecto, IVA 21 en solo lectura y ejemplo calculado", async () => {
    const { deps } = setup();
    const r = await getMarginSettingsPanel(deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data).toMatchObject({ vatPct: 21, origin: "defaults", degraded: false, savedBy: null, history: [] });
    expect(r.data.example.cost).toBe(20);
    expect(r.data.example.minPrice).toBe(minimumPrice(20, DEFAULT_MARGIN_PARAMS));
    expect(r.data.example.breakdown?.price).toBe(r.data.example.minPrice);
  });

  test("la BD falla → degraded con valores por defecto, sin romper", async () => {
    const { deps } = setup({ store: memoryStore({ failLatest: true, failHistory: true }) });
    const r = await getMarginSettingsPanel(deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data).toMatchObject({ degraded: true, origin: "defaults", history: [] });
    expect(r.data.values.targetMinPct).toBe(15);
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  test("historial: más reciente primero, quién/cuándo/nota y qué campos cambiaron", async () => {
    const { deps } = setup();
    await saveMarginSettings({ ...NEW_VALUES, note: "primero" }, deps);
    await saveMarginSettings({ ...NEW_VALUES, targetMinPct: 30, shippingCost: 7, note: "segundo" }, deps);
    const r = await getMarginSettingsPanel(deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.history.map((h) => h.note)).toEqual(["segundo", "primero"]);
    expect(r.data.history[0].changed.sort()).toEqual(["shippingCost", "targetMinPct"]);
    // El primero se compara con lo que regía antes (valores por defecto).
    expect(r.data.history[1].changed.sort()).toEqual(
      ["acquisitionCost", "returnsBufferPct", "shippingCost", "targetMaxPct", "targetMinPct"].sort()
    );
    expect(r.data.history[0].createdBy).toBe("yosra@bc.com");
    expect(r.data.note).toBe("segundo");
  });
});

describe("previewMarginSettings (ejemplo en vivo, sin guardar)", () => {
  test("calcula el PVP mínimo para un coste de 20 € con los valores enviados", async () => {
    const { deps, mem } = setup();
    const r = await previewMarginSettings(NEW_VALUES, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.minPrice).toBe(minimumPrice(20, toMarginParams(NEW_VALUES)));
    expect(r.data.breakdown?.netMarginPct).toBeGreaterThanOrEqual(25);
    expect(mem.calls).not.toContain("insert");
  });

  test("valores inválidos → invalid_request con campos", async () => {
    const { deps } = setup();
    expect(await previewMarginSettings({ ...NEW_VALUES, stripePct: 50 }, deps)).toEqual({
      ok: false,
      code: "invalid_request",
      fields: ["stripePct"],
    });
  });

  test("inalcanzable (colchón + mínimo se comen todo) → minPrice null, sin romper", async () => {
    const { deps } = setup();
    const r = await previewMarginSettings({ ...NEW_VALUES, returnsBufferPct: 30, targetMinPct: 80, targetMaxPct: 80 }, deps);
    if (!r.ok) throw new Error("debería ir bien");
    expect(r.data.minPrice).toBeNull();
    expect(r.data.breakdown).toBeNull();
  });
});

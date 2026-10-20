import { describe, expect, test } from "bun:test";
import type { MarginParams } from "./margin";
import {
  DEFAULT_MARGIN_PARAMS,
  VAT_PCT,
  createDbMarginSource,
  createMemoryMarginSettingsStore,
  isMemorySettingsEnabled,
  marginParamsFromEnv,
  marginSettings,
  resolveMarginSettings,
} from "./settings";
import type { MarginSettingsRecord, MarginSettingsStore } from "./settingsStore";

describe("DEFAULT_MARGIN_PARAMS (a validar con Yosra)", () => {
  test("valores por defecto acordados", () => {
    expect(DEFAULT_MARGIN_PARAMS).toEqual({
      vatPct: 21,
      shippingCost: 4.5,
      stripePct: 1.5,
      stripeFixed: 0.25,
      returnsBufferPct: 6,
      acquisitionCost: 0,
      targetMinPct: 15,
      targetMaxPct: 35,
    });
  });

  test("son coherentes (rango objetivo y porcentajes razonables)", () => {
    const p = DEFAULT_MARGIN_PARAMS;
    expect(p.targetMinPct).toBeLessThanOrEqual(p.targetMaxPct);
    for (const v of [p.vatPct, p.stripePct, p.returnsBufferPct, p.targetMinPct, p.targetMaxPct]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("marginParamsFromEnv", () => {
  test("sin variables → los valores por defecto (el grid y el modal siempre tienen margen)", () => {
    expect(marginParamsFromEnv({})).toEqual(DEFAULT_MARGIN_PARAMS);
  });

  test("cada MARGIN_* sobrescribe SOLO su parámetro", () => {
    const p = marginParamsFromEnv({
      MARGIN_SHIPPING_EUR: "5.25",
      MARGIN_RETURNS_BUFFER_PCT: "7",
      MARGIN_ACQUISITION_EUR: "2",
      MARGIN_TARGET_MIN_PCT: "20",
    });
    expect(p).toEqual({
      ...DEFAULT_MARGIN_PARAMS,
      shippingCost: 5.25,
      returnsBufferPct: 7,
      acquisitionCost: 2,
      targetMinPct: 20,
    });
  });

  test("valores inválidos se IGNORAN (default) y nunca producen NaN/negativos", () => {
    const p = marginParamsFromEnv({
      MARGIN_VAT_PCT: "abc",
      MARGIN_SHIPPING_EUR: "-1",
      MARGIN_STRIPE_PCT: "150",
      MARGIN_ACQUISITION_EUR: "",
    });
    expect(p).toEqual(DEFAULT_MARGIN_PARAMS);
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });

  test("rango objetivo invertido tras mezclar → vuelve al por defecto", () => {
    const p = marginParamsFromEnv({ MARGIN_TARGET_MIN_PCT: "50", MARGIN_TARGET_MAX_PCT: "10" });
    expect(p.targetMinPct).toBe(DEFAULT_MARGIN_PARAMS.targetMinPct);
    expect(p.targetMaxPct).toBe(DEFAULT_MARGIN_PARAMS.targetMaxPct);
    // Solo el mínimo por encima del máximo por defecto también se rechaza.
    expect(marginParamsFromEnv({ MARGIN_TARGET_MIN_PCT: "40" }).targetMinPct).toBe(DEFAULT_MARGIN_PARAMS.targetMinPct);
  });

  test("los defaults pasados por parámetro son los que se usan de base", () => {
    const base: MarginParams = { ...DEFAULT_MARGIN_PARAMS, shippingCost: 8 };
    expect(marginParamsFromEnv({}, base).shippingCost).toBe(8);
  });
});

describe("IVA fijo en código", () => {
  test("VAT_PCT = 21 y MARGIN_VAT_PCT se ignora aunque sea válido", () => {
    expect(VAT_PCT).toBe(21);
    expect(marginParamsFromEnv({ MARGIN_VAT_PCT: "10" }).vatPct).toBe(21);
  });
});

// ---------------------------------------------------------------- fuente BD

const STORED = {
  returnsBufferPct: 8,
  shippingCost: 5.25,
  acquisitionCost: 2,
  targetMinPct: 20,
  targetMaxPct: 40,
  stripePct: 1.4,
  stripeFixed: 0.25,
};

function fakeStore(opts: { latest?: () => Promise<MarginSettingsRecord | null> } = {}) {
  const calls: string[] = [];
  const store: MarginSettingsStore = {
    async latest() {
      calls.push("latest");
      return opts.latest
        ? opts.latest()
        : { id: 1, values: STORED, createdBy: "yosra@bc.com", createdAt: "2026-10-20T10:00:00.000Z", note: "inicial" };
    },
    async history() {
      calls.push("history");
      return [];
    },
    async insert() {
      calls.push("insert");
      throw new Error("no se usa aquí");
    },
  };
  return { store, calls };
}

describe("resolveMarginSettings: precedencia BD > MARGIN_* > defaults", () => {
  test("hay fila en BD → manda la BD (aunque haya MARGIN_*), con IVA de código", async () => {
    const { store } = fakeStore();
    const r = await resolveMarginSettings({ store, env: { MARGIN_SHIPPING_EUR: "9" } });
    expect(r.origin).toBe("db");
    expect(r.degraded).toBe(false);
    expect(r.params).toEqual({
      vatPct: 21,
      returnsBufferPct: 8,
      shippingCost: 5.25,
      acquisitionCost: 2,
      targetMinPct: 20,
      targetMaxPct: 40,
      stripePct: 1.4,
      stripeFixed: 0.25,
    });
    expect(r.record?.createdBy).toBe("yosra@bc.com");
  });

  test("sin filas y con MARGIN_* → origen env", async () => {
    const { store } = fakeStore({ latest: async () => null });
    const r = await resolveMarginSettings({ store, env: { MARGIN_SHIPPING_EUR: "9" } });
    expect(r).toMatchObject({ origin: "env", degraded: false, record: null });
    expect(r.params.shippingCost).toBe(9);
  });

  test("sin filas ni MARGIN_* → valores por defecto", async () => {
    const { store } = fakeStore({ latest: async () => null });
    const r = await resolveMarginSettings({ store, env: {} });
    expect(r).toMatchObject({ origin: "defaults", degraded: false });
    expect(r.params).toEqual({ ...DEFAULT_MARGIN_PARAMS });
  });

  test("la BD falla → env/defaults con degraded:true, sin romper y sin NaN", async () => {
    const { store } = fakeStore({ latest: async () => { throw new Error("db down"); } });
    const r = await resolveMarginSettings({ store, env: {} });
    expect(r).toMatchObject({ origin: "defaults", degraded: true, record: null });
    for (const v of Object.values(r.params)) expect(Number.isFinite(v)).toBe(true);
    const withEnv = await resolveMarginSettings({ store, env: { MARGIN_TARGET_MIN_PCT: "18" } });
    expect(withEnv).toMatchObject({ origin: "env", degraded: true });
    expect(withEnv.params.targetMinPct).toBe(18);
  });

  test("fila corrupta (fuera de rango / no numérica / objetivo < mínimo) = fallo → degraded", async () => {
    for (const bad of [
      { ...STORED, returnsBufferPct: 99 },
      { ...STORED, shippingCost: "abc" },
      { ...STORED, targetMinPct: 50, targetMaxPct: 10 },
      { ...STORED, stripePct: null },
    ]) {
      const { store } = fakeStore({
        latest: async () => ({ id: 2, values: bad, createdBy: "x@y.z", createdAt: "2026-10-20T10:00:00.000Z", note: null }),
      });
      const r = await resolveMarginSettings({ store, env: {} });
      expect(r.degraded).toBe(true);
      expect(r.params).toEqual({ ...DEFAULT_MARGIN_PARAMS });
    }
  });

  test("numeric de la BD como cadena ('5.25') se acepta", async () => {
    const { store } = fakeStore({
      latest: async () => ({ id: 3, values: { ...STORED, shippingCost: "5.25" }, createdBy: "x@y.z", createdAt: "2026-10-20T10:00:00.000Z", note: null }),
    });
    const r = await resolveMarginSettings({ store, env: {} });
    expect(r.origin).toBe("db");
    expect(r.params.shippingCost).toBe(5.25);
  });
});

describe("createDbMarginSource: caché corta e invalidación", () => {
  test("dos lecturas seguidas → una sola consulta; pasado el TTL, otra", async () => {
    let t = 1_000;
    const { store, calls } = fakeStore();
    const src = createDbMarginSource({ store, env: {}, now: () => t, ttlMs: 30_000 });
    await src.get();
    await src.get();
    expect(calls.filter((c) => c === "latest")).toHaveLength(1);
    t += 30_001;
    await src.get();
    expect(calls.filter((c) => c === "latest")).toHaveLength(2);
  });

  test("invalidate() fuerza a releer al momento", async () => {
    const { store, calls } = fakeStore();
    const src = createDbMarginSource({ store, env: {}, now: () => 1_000 });
    await src.get();
    src.invalidate();
    await src.get();
    expect(calls.filter((c) => c === "latest")).toHaveLength(2);
  });

  test("un fallo de BD se cachea menos tiempo (reintenta pronto)", async () => {
    let t = 1_000;
    let fail = true;
    const { store, calls } = fakeStore({
      latest: async () => {
        if (fail) throw new Error("down");
        return null;
      },
    });
    const src = createDbMarginSource({ store, env: {}, now: () => t, ttlMs: 30_000, degradedTtlMs: 5_000 });
    expect((await src.resolve()).degraded).toBe(true);
    fail = false;
    t += 5_001;
    expect((await src.resolve()).degraded).toBe(false);
    expect(calls.filter((c) => c === "latest")).toHaveLength(2);
  });

  test("get() devuelve MarginParams completos (misma firma de 3.3: el modal no cambia)", async () => {
    const { store } = fakeStore();
    const p = await createDbMarginSource({ store, env: {} }).get();
    expect(Object.keys(p).sort()).toEqual(Object.keys(DEFAULT_MARGIN_PARAMS).sort());
  });
});

describe("almacén en memoria (solo desarrollo)", () => {
  test("MARGIN_SETTINGS_MEMORY=1 solo vale fuera de producción", () => {
    expect(isMemorySettingsEnabled({ MARGIN_SETTINGS_MEMORY: "1", NODE_ENV: "development" })).toBe(true);
    expect(isMemorySettingsEnabled({ MARGIN_SETTINGS_MEMORY: "1", NODE_ENV: "production" })).toBe(false);
    expect(isMemorySettingsEnabled({ MARGIN_SETTINGS_MEMORY: "true", NODE_ENV: "development" })).toBe(false);
    expect(isMemorySettingsEnabled({ NODE_ENV: "development" })).toBe(false);
  });

  test("es de solo inserción y la vigente es la última", async () => {
    let t = Date.parse("2026-10-20T10:00:00.000Z");
    const store = createMemoryMarginSettingsStore(() => (t += 1000));
    expect(await store.latest()).toBeNull();
    await store.insert({ values: { ...STORED }, createdBy: "a@b.c", note: null });
    await store.insert({ values: { ...STORED, targetMinPct: 30 }, createdBy: "a@b.c", note: "2" });
    expect((await store.latest())?.note).toBe("2");
    expect((await store.history(10)).map((r) => r.id)).toEqual([2, 1]);
    expect(Object.keys(store).sort()).toEqual(["history", "insert", "latest"]);
  });
});

describe("marginSettings(): punto único de cableado", () => {
  test("devuelve la fuente de BD (singleton) con caché e invalidación", () => {
    expect(marginSettings()).toBe(marginSettings());
    expect(typeof marginSettings().invalidate).toBe("function");
    expect(typeof marginSettings().resolve).toBe("function");
  });

  test("estado ÚNICO por proceso (globalThis): todas las rutas comparten caché e invalidación", () => {
    const g = globalThis as unknown as { __bcMarginSettings?: { source: unknown; store: unknown } };
    expect(g.__bcMarginSettings?.source).toBe(marginSettings());
    expect(g.__bcMarginSettings?.store).toBeDefined();
  });

  test("en los tests NUNCA se consulta la BD real (el almacén está sustituido en test/setup.ts)", async () => {
    marginSettings().invalidate();
    const r = await marginSettings().resolve();
    // Contra la BD real (sin la tabla o sin red) esto saldría degraded:true.
    expect(r.degraded).toBe(false);
    expect(r.record).toBeNull();
  });
});

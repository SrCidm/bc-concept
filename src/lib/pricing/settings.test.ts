import { describe, expect, test } from "bun:test";
import type { MarginParams } from "./margin";
import { DEFAULT_MARGIN_PARAMS, defaultMarginSource, marginParamsFromEnv, marginSettings } from "./settings";

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

describe("MarginSettingsSource (punto único de cableado para 3.4)", () => {
  test("la fuente por defecto es asíncrona y devuelve parámetros completos", async () => {
    const p = await defaultMarginSource.get();
    expect(p.vatPct).toBe(21);
    expect(typeof p.acquisitionCost).toBe("number");
  });

  test("marginSettings() expone la fuente activa; una fuente de BD de 3.4 es intercambiable (stub)", async () => {
    expect(marginSettings()).toBe(defaultMarginSource);
    const dbLike = { get: async (): Promise<MarginParams> => ({ ...DEFAULT_MARGIN_PARAMS, targetMinPct: 25 }) };
    expect((await dbLike.get()).targetMinPct).toBe(25);
  });
});

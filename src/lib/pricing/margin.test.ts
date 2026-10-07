import { describe, expect, test } from "bun:test";
import { computeMargin, parseMarginParams, type MarginParams } from "./margin";

const params: MarginParams = {
  vatPct: 21,
  shippingCost: 4,
  stripePct: 1.5,
  stripeFixed: 0.25,
  returnsBufferPct: 3,
  targetMinPct: 15,
  targetMaxPct: 35,
};

describe("computeMargin", () => {
  test("aplica la fórmula de economía unitaria del CLAUDE.md", () => {
    const m = computeMargin(18.5, 59.9, params);
    expect(m).not.toBeNull();
    // ingresos netos = 59.9 / 1.21
    expect(m!.netRevenue).toBeCloseTo(49.5, 1);
    expect(m!.vat).toBeCloseTo(10.4, 1);
    expect(m!.stripeFee).toBeCloseTo(59.9 * 0.015 + 0.25, 2);
    expect(m!.returnsBuffer).toBeCloseTo(49.5 * 0.03, 1);
    const expected = 49.504 - 18.5 - 4 - (59.9 * 0.015 + 0.25) - 49.504 * 0.03;
    expect(m!.netMargin).toBeCloseTo(expected, 1);
    expect(m!.netMarginPct).toBeCloseTo((expected / 49.504) * 100, 1);
  });

  test("clasifica contra el objetivo configurable (below/within/above)", () => {
    expect(computeMargin(40, 59.9, params)!.target).toBe("below");
    expect(computeMargin(30, 59.9, params)!.target).toBe("within");
    expect(computeMargin(5, 59.9, params)!.target).toBe("above");
    // El objetivo lo manda el parámetro, no el código.
    expect(computeMargin(30, 59.9, { ...params, targetMinPct: 60, targetMaxPct: 80 })!.target).toBe("below");
  });

  test("entradas inválidas → null", () => {
    expect(computeMargin(-1, 50, params)).toBeNull();
    expect(computeMargin(10, 0, params)).toBeNull();
    expect(computeMargin(Number.NaN, 50, params)).toBeNull();
  });
});

describe("parseMarginParams (sin valores por defecto)", () => {
  const env = {
    MARGIN_VAT_PCT: "21",
    MARGIN_SHIPPING_EUR: "4",
    MARGIN_STRIPE_PCT: "1.5",
    MARGIN_STRIPE_FIXED_EUR: "0.25",
    MARGIN_RETURNS_BUFFER_PCT: "3",
    MARGIN_TARGET_MIN_PCT: "15",
    MARGIN_TARGET_MAX_PCT: "35",
  };

  test("lee todos los parámetros del entorno", () => {
    expect(parseMarginParams(env)).toEqual(params);
  });

  test("falta cualquiera → null (nunca se inventa un valor)", () => {
    for (const key of Object.keys(env)) {
      const partial: Record<string, string | undefined> = { ...env };
      delete partial[key];
      expect(parseMarginParams(partial)).toBeNull();
    }
    expect(parseMarginParams({})).toBeNull();
  });

  test("valores inválidos o rango objetivo invertido → null", () => {
    expect(parseMarginParams({ ...env, MARGIN_VAT_PCT: "abc" })).toBeNull();
    expect(parseMarginParams({ ...env, MARGIN_SHIPPING_EUR: "-1" })).toBeNull();
    expect(parseMarginParams({ ...env, MARGIN_TARGET_MIN_PCT: "50", MARGIN_TARGET_MAX_PCT: "10" })).toBeNull();
  });
});

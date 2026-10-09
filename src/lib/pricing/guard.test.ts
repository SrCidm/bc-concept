import { describe, expect, test } from "bun:test";
import { evaluateMarginGuard, minimumPrice, worstCaseCost } from "./guard";
import type { MarginParams } from "./margin";

const params: MarginParams = {
  vatPct: 21,
  shippingCost: 4.5,
  stripePct: 1.5,
  stripeFixed: 0.25,
  returnsBufferPct: 6,
  acquisitionCost: 0,
  targetMinPct: 15,
  targetMaxPct: 35,
};

describe("evaluateMarginGuard", () => {
  test("margen holgado → ok (no hay aviso ni confirmación)", () => {
    const c = evaluateMarginGuard(10, 59.9, params)!;
    expect(c.belowMin).toBe(false);
    expect(c.loss).toBe(false);
    expect(c.minPct).toBe(15);
    expect(c.breakdown.netMargin).toBeGreaterThan(0);
  });

  test("por debajo del mínimo → belowMin (aunque siga habiendo beneficio)", () => {
    const c = evaluateMarginGuard(34, 59.9, params)!;
    expect(c.breakdown.netMargin).toBeGreaterThan(0);
    expect(c.belowMin).toBe(true);
    expect(c.loss).toBe(false);
  });

  test("margen ≤ 0 → pérdida (y por tanto también por debajo del mínimo)", () => {
    const c = evaluateMarginGuard(60, 59.9, params)!;
    expect(c.loss).toBe(true);
    expect(c.belowMin).toBe(true);
  });

  test("el mínimo lo manda el parámetro (no el código)", () => {
    expect(evaluateMarginGuard(30, 59.9, params)!.belowMin).toBe(false);
    expect(evaluateMarginGuard(30, 59.9, { ...params, targetMinPct: 40 })!.belowMin).toBe(true);
  });

  test("el coste de adquisición y el envío por producto cuentan en la guarda", () => {
    expect(evaluateMarginGuard(25, 59.9, params)!.belowMin).toBe(false);
    expect(evaluateMarginGuard(25, 59.9, { ...params, acquisitionCost: 10 })!.belowMin).toBe(true);
    expect(evaluateMarginGuard(25, 59.9, params, { shippingCost: 15 })!.belowMin).toBe(true);
  });

  test("entradas inválidas → null (la guarda nunca da luz verde a ciegas)", () => {
    expect(evaluateMarginGuard(-1, 50, params)).toBeNull();
    expect(evaluateMarginGuard(10, 0, params)).toBeNull();
    expect(evaluateMarginGuard(Number.NaN, 50, params)).toBeNull();
  });
});

describe("minimumPrice", () => {
  test("al precio mínimo se cumple el margen mínimo; un céntimo menos, no", () => {
    for (const cost of [3.5, 18.5, 42, 95]) {
      const p = minimumPrice(cost, params)!;
      expect(p).toBeGreaterThan(cost);
      expect(evaluateMarginGuard(cost, p, params)!.belowMin).toBe(false);
      expect(evaluateMarginGuard(cost, Math.round((p - 0.01) * 100) / 100, params)!.belowMin).toBe(true);
    }
  });

  test("sube con el envío por producto, el colchón y el coste de adquisición", () => {
    const base = minimumPrice(20, params)!;
    expect(minimumPrice(20, params, { shippingCost: 10 })!).toBeGreaterThan(base);
    expect(minimumPrice(20, { ...params, returnsBufferPct: 10 })!).toBeGreaterThan(base);
    expect(minimumPrice(20, { ...params, acquisitionCost: 5 })!).toBeGreaterThan(base);
  });

  test("inalcanzable (porcentajes que se comen el 100 %) → null", () => {
    expect(minimumPrice(20, { ...params, returnsBufferPct: 50, targetMinPct: 50 })).toBeNull();
    expect(minimumPrice(Number.NaN, params)).toBeNull();
    expect(minimumPrice(-5, params)).toBeNull();
  });

  test("es un precio con 2 decimales", () => {
    const p = minimumPrice(18.5, params)!;
    expect(Math.round(p * 100) / 100).toBe(p);
  });
});

describe("worstCaseCost (coste de referencia = el más alto entre producto y variantes)", () => {
  test("una variante cara manda sobre el coste del producto", () => {
    expect(worstCaseCost(18.5, [18.5, 22, 19])).toBe(22);
    expect(worstCaseCost(30, [18.5, 22])).toBe(30);
  });

  test("sin variantes → el del producto; valores inválidos se ignoran", () => {
    expect(worstCaseCost(18.5, [])).toBe(18.5);
    expect(worstCaseCost(18.5, [Number.NaN, -3])).toBe(18.5);
  });

  test("una variante cara hace saltar la guarda aunque el producto base sea rentable", () => {
    const price = 59.9;
    expect(evaluateMarginGuard(18.5, price, params)!.belowMin).toBe(false);
    expect(evaluateMarginGuard(worstCaseCost(18.5, [18.5, 36]), price, params)!.belowMin).toBe(true);
  });
});

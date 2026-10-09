import { describe, expect, test } from "bun:test";
import { computeMargin, type MarginParams } from "./margin";

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

  test("coste de adquisición por pedido: opcional (0 por defecto) y se resta del margen", () => {
    const base = computeMargin(18.5, 59.9, params)!;
    expect(base.acquisition).toBe(0);
    expect(computeMargin(18.5, 59.9, { ...params, acquisitionCost: 0 })!.netMargin).toBe(base.netMargin);

    const withAds = computeMargin(18.5, 59.9, { ...params, acquisitionCost: 3 })!;
    expect(withAds.acquisition).toBe(3);
    expect(withAds.netMargin).toBeCloseTo(base.netMargin - 3, 2);
  });

  test("el envío puede venir POR PRODUCTO (3.4) sin tocar los parámetros globales", () => {
    const base = computeMargin(18.5, 59.9, params)!;
    const heavy = computeMargin(18.5, 59.9, params, { shippingCost: 9 })!;
    expect(heavy.shipping).toBe(9);
    expect(heavy.netMargin).toBeCloseTo(base.netMargin - 5, 2);
    // Sin override se usa el global.
    expect(computeMargin(18.5, 59.9, params, {})!.shipping).toBe(4);
  });
});

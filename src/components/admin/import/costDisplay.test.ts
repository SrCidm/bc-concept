import { describe, expect, test } from "bun:test";
import { costHeaderText, costRowLabelKey } from "./costDisplay";
import { formatMoneyRange } from "./format";

/** Intl usa espacios duros (NBSP / NNBSP): se normalizan para comparar texto legible. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoneyRange", () => {
  test("rango en euros: el símbolo solo al final", () => {
    expect(plain(formatMoneyRange(34.03, 36.75, "EUR"))).toBe("34,03–36,75 €");
  });

  test("moneda no válida: no lanza", () => {
    expect(plain(formatMoneyRange(1, 2, "???"))).toContain("1.00–2.00");
  });
});

describe("cabecera de coste del modal", () => {
  const base = { cost: { amount: 34.03, currency: "EUR" } };

  test("variantes con costes DISTINTOS: muestra el rango y el desglose lo explica", () => {
    const p = { ...base, minCost: 34.03, worstCaseCost: 36.75, costVaries: true };
    expect(plain(costHeaderText(p))).toBe("34,03–36,75 €");
    expect(costRowLabelKey(p.costVaries)).toBe("costWorst");
  });

  test("todas las variantes cuestan lo mismo: se queda como está (un único importe)", () => {
    const p = { ...base, minCost: 34.03, worstCaseCost: 34.03, costVaries: false };
    expect(plain(costHeaderText(p))).toBe("34,03 €");
    expect(costRowLabelKey(p.costVaries)).toBe("cost");
  });

  test("sin variantes (solo el producto): un único importe", () => {
    const p = { ...base, minCost: 34.03, worstCaseCost: 34.03, costVaries: false };
    expect(plain(costHeaderText(p))).toBe("34,03 €");
  });

  test("el producto base más caro que sus variantes: el rango sigue de menor a mayor", () => {
    const p = { cost: { amount: 40, currency: "EUR" }, minCost: 30, worstCaseCost: 40, costVaries: true };
    expect(plain(costHeaderText(p))).toBe("30,00–40,00 €");
  });
});

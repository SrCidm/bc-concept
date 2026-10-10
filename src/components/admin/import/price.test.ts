import { describe, expect, test } from "bun:test";
import { formatPriceInput, parsePriceInput } from "./price";

describe("parsePriceInput", () => {
  test("coma o punto, hasta 2 decimales", () => {
    expect(parsePriceInput("59,90")).toBe(59.9);
    expect(parsePriceInput("59.9")).toBe(59.9);
    expect(parsePriceInput(" 120 ")).toBe(120);
    expect(parsePriceInput("0,01")).toBe(0.01);
  });

  test("rechaza lo evidentemente inválido", () => {
    for (const bad of ["", "abc", "-5", "0", "0,00", "1,234", "1e3", "1.000,50", "12345678", "5 €", "NaN", "Infinity", "1,,5"]) {
      expect(parsePriceInput(bad)).toBeNull();
    }
  });
});

describe("formatPriceInput", () => {
  test("siempre 2 decimales con coma", () => {
    expect(formatPriceInput(59.9)).toBe("59,90");
    expect(formatPriceInput(120)).toBe("120,00");
  });
});

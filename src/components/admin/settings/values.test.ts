import { describe, expect, test } from "bun:test";
import { formatDecimalInput, formatFieldValue, inRange, parseDecimalInput } from "./values";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("parseDecimalInput", () => {
  test("coma o punto, cero permitido, hasta 2 decimales", () => {
    expect(parseDecimalInput("4,50")).toBe(4.5);
    expect(parseDecimalInput("4.5")).toBe(4.5);
    expect(parseDecimalInput("0")).toBe(0);
    expect(parseDecimalInput(" 15 ")).toBe(15);
  });

  test("rechaza lo que no es un número sencillo", () => {
    for (const bad of ["", "-1", "1,234", "abc", "1e2", "1000", "4,5 €", "1,,5"]) expect(parseDecimalInput(bad)).toBeNull();
  });
});

describe("formato", () => {
  test("€ siempre con 2 decimales; % sin ceros sobrantes", () => {
    expect(formatDecimalInput("shippingCost", 4.5)).toBe("4,50");
    expect(formatDecimalInput("returnsBufferPct", 6)).toBe("6");
    expect(formatDecimalInput("stripePct", 1.5)).toBe("1,5");
    expect(plain(formatFieldValue("targetMinPct", 15))).toBe("15 %");
    expect(plain(formatFieldValue("stripeFixed", 0.25))).toBe("0,25 €");
  });

  test("inRange usa los rangos del contrato", () => {
    expect(inRange("returnsBufferPct", 30)).toBe(true);
    expect(inRange("returnsBufferPct", 31)).toBe(false);
    expect(inRange("stripeFixed", 2)).toBe(true);
    expect(inRange("stripeFixed", 2.01)).toBe(false);
  });
});

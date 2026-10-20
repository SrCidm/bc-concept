import { describe, expect, test } from "bun:test";
import { parseMarginSettingsInput, parseMarginSettingsValues } from "./settingsInput";

const VALID = {
  returnsBufferPct: 6,
  shippingCost: 4.5,
  acquisitionCost: 0,
  targetMinPct: 15,
  targetMaxPct: 35,
  stripePct: 1.5,
  stripeFixed: 0.25,
};

describe("parseMarginSettingsInput: rangos cerrados", () => {
  test("valores válidos → normalizados, nota opcional recortada", () => {
    expect(parseMarginSettingsInput(VALID)).toEqual({ ok: true, values: VALID, note: null });
    expect(parseMarginSettingsInput({ ...VALID, note: "  Ajuste de Yosra  " })).toEqual({
      ok: true,
      values: VALID,
      note: "Ajuste de Yosra",
    });
    expect(parseMarginSettingsInput({ ...VALID, note: "   " })).toMatchObject({ ok: true, note: null });
  });

  test("los extremos de cada rango se aceptan", () => {
    const lows = { returnsBufferPct: 0, shippingCost: 0, acquisitionCost: 0, targetMinPct: 0, targetMaxPct: 0, stripePct: 0, stripeFixed: 0 };
    const highs = { returnsBufferPct: 30, shippingCost: 100, acquisitionCost: 200, targetMinPct: 80, targetMaxPct: 100, stripePct: 10, stripeFixed: 2 };
    expect(parseMarginSettingsInput(lows).ok).toBe(true);
    expect(parseMarginSettingsInput(highs).ok).toBe(true);
  });

  const outOfRange: Array<[string, Record<string, unknown>, string]> = [
    ["colchón > 30 %", { returnsBufferPct: 30.01 }, "returnsBufferPct"],
    ["colchón negativo", { returnsBufferPct: -1 }, "returnsBufferPct"],
    ["margen mínimo > 80 %", { targetMinPct: 81, targetMaxPct: 90 }, "targetMinPct"],
    ["objetivo > 100 %", { targetMaxPct: 101 }, "targetMaxPct"],
    ["objetivo por debajo del mínimo", { targetMinPct: 40, targetMaxPct: 30 }, "targetMaxPct"],
    ["envío > 100 €", { shippingCost: 100.01 }, "shippingCost"],
    ["adquisición > 200 €", { acquisitionCost: 250 }, "acquisitionCost"],
    ["Stripe % > 10", { stripePct: 10.5 }, "stripePct"],
    ["Stripe fijo > 2 €", { stripeFixed: 2.01 }, "stripeFixed"],
    ["más de 2 decimales", { shippingCost: 4.555 }, "shippingCost"],
    ["texto en vez de número", { stripePct: "1,5" }, "stripePct"],
    ["NaN", { returnsBufferPct: Number.NaN }, "returnsBufferPct"],
    ["Infinity", { acquisitionCost: Number.POSITIVE_INFINITY }, "acquisitionCost"],
    ["null", { stripeFixed: null }, "stripeFixed"],
  ];

  for (const [name, patch, field] of outOfRange) {
    test(`rechaza: ${name} → marca el campo ${field}`, () => {
      const r = parseMarginSettingsInput({ ...VALID, ...patch });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.fields).toContain(field);
    });
  }

  test("falta un campo → se marca", () => {
    const rest: Record<string, unknown> = { ...VALID };
    delete rest.stripeFixed;
    const r = parseMarginSettingsInput(rest);
    expect(r).toEqual({ ok: false, fields: ["stripeFixed"] });
  });

  test("varios errores → todos los campos, en orden estable", () => {
    const r = parseMarginSettingsInput({ ...VALID, returnsBufferPct: 99, stripePct: 99 });
    expect(r).toEqual({ ok: false, fields: ["returnsBufferPct", "stripePct"] });
  });

  test("nota: larga o con caracteres de control → se marca 'note'", () => {
    expect(parseMarginSettingsInput({ ...VALID, note: "x".repeat(281) })).toEqual({ ok: false, fields: ["note"] });
    expect(parseMarginSettingsInput({ ...VALID, note: "hola\u0000mundo" })).toEqual({ ok: false, fields: ["note"] });
    expect(parseMarginSettingsInput({ ...VALID, note: 42 })).toEqual({ ok: false, fields: ["note"] });
  });

  test("cuerpo que no es un objeto → 'body'", () => {
    for (const bad of [null, "x", 3, [1, 2]]) {
      expect(parseMarginSettingsInput(bad)).toEqual({ ok: false, fields: ["body"] });
    }
  });

  test("el error NUNCA contiene los valores enviados (sin eco)", () => {
    const r = parseMarginSettingsInput({ ...VALID, returnsBufferPct: 77.77, note: "<script>alert(1)</script>".repeat(20) });
    const text = JSON.stringify(r);
    expect(text).not.toContain("77.77");
    expect(text).not.toContain("script");
  });

  test("campos extra del cliente (createdBy, vatPct, id) se ignoran", () => {
    const r = parseMarginSettingsInput({ ...VALID, createdBy: "evil@x.com", vatPct: 4, id: 9 });
    expect(r).toEqual({ ok: true, values: VALID, note: null });
  });
});

describe("parseMarginSettingsValues (también valida filas leídas de la BD)", () => {
  test("acepta números como cadena numérica que pudiera devolver la BD", () => {
    const r = parseMarginSettingsValues(
      { ...VALID, shippingCost: "4.50", stripeFixed: "0.25" },
      { allowNumericStrings: true }
    );
    expect(r).toEqual({ ok: true, values: { ...VALID, shippingCost: 4.5, stripeFixed: 0.25 } });
  });

  test("sin allowNumericStrings, las cadenas se rechazan (entrada del cliente)", () => {
    expect(parseMarginSettingsValues({ ...VALID, shippingCost: "4.50" }).ok).toBe(false);
  });
});

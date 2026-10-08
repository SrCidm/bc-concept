import { describe, expect, test } from "bun:test";
import { isPaletteInvertUser } from "./adminFlags";

describe("isPaletteInvertUser", () => {
  const RAW = " Sergio@Example.com , otro@example.com ";

  test("coincide sin importar mayúsculas ni espacios, en ambos lados", () => {
    expect(isPaletteInvertUser("sergio@example.com", RAW)).toBe(true);
    expect(isPaletteInvertUser("  SERGIO@example.COM ", RAW)).toBe(true);
  });

  test("otra admin (Yosra) no lo tiene", () => {
    expect(isPaletteInvertUser("yosra@example.com", RAW)).toBe(false);
  });

  test("fail-closed: sin variable, vacía, o sin email → nadie", () => {
    expect(isPaletteInvertUser("sergio@example.com", undefined)).toBe(false);
    expect(isPaletteInvertUser("sergio@example.com", "")).toBe(false);
    expect(isPaletteInvertUser(null, RAW)).toBe(false);
    expect(isPaletteInvertUser(undefined, RAW)).toBe(false);
    expect(isPaletteInvertUser("", RAW)).toBe(false);
  });

  test("no hace coincidencias parciales", () => {
    expect(isPaletteInvertUser("sergio@example.com.evil.io", RAW)).toBe(false);
    expect(isPaletteInvertUser("xsergio@example.com", RAW)).toBe(false);
  });
});

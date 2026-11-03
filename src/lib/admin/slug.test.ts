import { describe, expect, test } from "bun:test";
import { SLUG_MAX, slugify, uniqueSlug } from "./slug";

const VALID = /^[a-z0-9]+(-[a-z0-9]+)*$/; // el mismo CHECK que la BD

describe("slugify", () => {
  test("tildes, ñ, mayúsculas y símbolos", () => {
    expect(slugify("Cojín pompones Terracota 45×45 cm")).toBe("cojin-pompones-terracota-45-45-cm");
    expect(slugify("Lámpara «Niña» de mesa — cerámica")).toBe("lampara-nina-de-mesa-ceramica");
    expect(slugify("Jarrón & plato")).toBe("jarron-y-plato");
    expect(slugify("  Straße   Œuvre  ")).toBe("strasse-oeuvre");
    expect(slugify("¡¡¡ !!!")).toBe("");
  });

  test("máximo 80 caracteres, cortando por palabra", () => {
    const s = slugify("Cordless Touch Dimmable Table Lamp, Fabric Shade Portable Rechargeable LED Bedside Night Lamp, Warm Ambient Light");
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s).toMatch(VALID);
    expect(s.endsWith("-")).toBe(false);
    expect(slugify("x".repeat(120))).toHaveLength(SLUG_MAX);
  });

  test("siempre cumple el formato de la BD", () => {
    for (const t of ["A-B--C", "--hola--", "123 456", "Ünïcödé ñandú", "a_b.c/d"]) expect(slugify(t)).toMatch(VALID);
  });
});

describe("uniqueSlug", () => {
  test("libre → tal cual; ocupado → -2, -3…", () => {
    expect(uniqueSlug("cojin", new Set(), "producto-x")).toBe("cojin");
    expect(uniqueSlug("cojin", new Set(["cojin"]), "producto-x")).toBe("cojin-2");
    expect(uniqueSlug("cojin", new Set(["cojin", "cojin-2", "cojin-3"]), "producto-x")).toBe("cojin-4");
  });

  test("base vacía → la de respaldo", () => {
    expect(uniqueSlug("", new Set(), "producto-1a2b3c4d")).toBe("producto-1a2b3c4d");
  });

  test("con sufijo sigue dentro del máximo y con formato válido", () => {
    const base = slugify("palabra ".repeat(30));
    const s = uniqueSlug(base, new Set([base]), "producto-x");
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s).toMatch(VALID);
    expect(s.endsWith("-2")).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { importQueryString, parseImportParams } from "./importParams";

describe("parseImportParams", () => {
  test("sin parámetros: página 1, UE y stock activos, 24 por página", () => {
    const r = parseImportParams({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ui).toEqual({ q: "", page: 1, eu: true, stock: true });
    expect(r.query).toMatchObject({ page: 1, pageSize: 24, euOnly: true, inStockOnly: true, lang: "es" });
  });

  test("eu=0 / stock=0 apagan los filtros; q se recorta", () => {
    const r = parseImportParams({ q: "  lámpara ", page: "3", eu: "0", stock: "0" });
    if (!r.ok) throw new Error("debería ser válido");
    expect(r.ui).toEqual({ q: "lámpara", page: 3, eu: false, stock: false });
    expect(r.query).toMatchObject({ query: "lámpara", page: 3, euOnly: false, inStockOnly: false });
  });

  test("parámetros repetidos (envío nativo del formulario): gana el último", () => {
    const on = parseImportParams({ eu: ["0", "1"] });
    const off = parseImportParams({ eu: ["1", "0"] });
    expect(on.ok && on.ui.eu).toBe(true);
    expect(off.ok && off.ui.eu).toBe(false);
  });

  test("entradas hostiles se rechazan (no se corrigen)", () => {
    expect(parseImportParams({ page: "0" }).ok).toBe(false);
    expect(parseImportParams({ page: "-1" }).ok).toBe(false);
    expect(parseImportParams({ page: "1e3" }).ok).toBe(false);
    expect(parseImportParams({ page: "99999999" }).ok).toBe(false);
    expect(parseImportParams({ q: "x".repeat(81) }).ok).toBe(false);
  });

  test("no deja colar pageSize, category ni lang desde la URL de la página", () => {
    const r = parseImportParams({ pageSize: "100", category: "abc", lang: "en" });
    if (!r.ok) throw new Error("debería ser válido");
    expect(r.query.pageSize).toBe(24);
    expect(r.query.category).toBeUndefined();
    expect(r.query.lang).toBe("es");
  });
});

describe("importQueryString", () => {
  test("omite los valores por defecto", () => {
    expect(importQueryString({ q: "", page: 1, eu: true, stock: true })).toBe("");
    expect(importQueryString({ q: "jarrón", page: 2, eu: false, stock: true })).toBe("q=jarr%C3%B3n&page=2&eu=0");
  });
});

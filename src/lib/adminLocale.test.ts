import { describe, expect, test } from "bun:test";
import { adminSpanishPath, isAdminPath } from "./adminLocale";

describe("adminSpanishPath (admin solo en ES)", () => {
  test("/en/admin/** se redirige a /admin/** conservando la ruta", () => {
    expect(adminSpanishPath("/en/admin")).toBe("/admin");
    expect(adminSpanishPath("/en/admin/")).toBe("/admin/");
    expect(adminSpanishPath("/en/admin/login")).toBe("/admin/login");
    expect(adminSpanishPath("/en/admin/import")).toBe("/admin/import");
  });

  test("no toca el storefront ni rutas parecidas", () => {
    for (const p of ["/", "/en", "/en/", "/catalog", "/en/catalog", "/admin", "/admin/import", "/en/administracion", "/en/adminx", "/es/admin"]) {
      expect(adminSpanishPath(p)).toBeNull();
    }
  });
});

describe("isAdminPath", () => {
  test("rutas admin sin prefijo", () => {
    for (const p of ["/admin", "/admin/", "/admin/login", "/admin/import"]) expect(isAdminPath(p)).toBe(true);
  });
  test("no confunde otras rutas", () => {
    for (const p of ["/", "/en", "/en/admin", "/catalog", "/administracion", "/adminx", "/es/admin"]) expect(isAdminPath(p)).toBe(false);
  });
});

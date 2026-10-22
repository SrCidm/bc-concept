import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import middleware, { config } from "@/middleware";
import { routing } from "@/i18n/routing";
import { legacyRedirectPath } from "./legacyRedirects";

/**
 * Rutas localizadas (next-intl `pathnames`) ejecutando el middleware REAL.
 * Vigila además que /admin/** siga fuera de la negociación de idioma con
 * `pathnames` activo (fix del bucle con NEXT_LOCALE=en, 202a5d7) y que /api/**
 * ni pase por el middleware.
 */
const BASE = "http://localhost:3000";

function run(path: string, headers: Record<string, string> = {}) {
  const res = middleware(new NextRequest(new URL(path, BASE), { headers }));
  const location = res.headers.get("location");
  const rewrite = res.headers.get("x-middleware-rewrite");
  return {
    status: res.status,
    location: location ? location.replace(BASE, "") : null,
    rewrite: rewrite ? new URL(rewrite).pathname : null,
  };
}

const EN_VISITOR = { cookie: "NEXT_LOCALE=en", "accept-language": "en-GB,en;q=0.9" };

describe("rutas localizadas", () => {
  test("cada página pública tiene su URL por idioma", () => {
    expect(routing.pathnames["/catalog"]).toEqual({ es: "/coleccion", en: "/collection" });
    expect(routing.pathnames["/sobre-nosotros"]).toEqual({ es: "/sobre-nosotros", en: "/about" });
    expect(routing.pathnames["/contacto"]).toEqual({ es: "/contacto", en: "/contact" });
  });

  test("la URL pública se reescribe a la carpeta interna", () => {
    expect(run("/coleccion").rewrite).toBe("/es/catalog");
    expect(run("/en/collection").rewrite).toBe("/en/catalog");
    expect(run("/sobre-nosotros").rewrite).toBe("/es/sobre-nosotros");
    expect(run("/en/about").rewrite).toBe("/en/sobre-nosotros");
    expect(run("/contacto").rewrite).toBe("/es/contacto");
    expect(run("/en/contact").rewrite).toBe("/en/contacto");
  });

  test("la URL de otro idioma redirige a la suya", () => {
    expect(run("/en/sobre-nosotros").location).toBe("/en/about");
    expect(run("/en/coleccion").location).toBe("/en/collection");
  });
});

describe("redirección permanente desde /catalog", () => {
  test("helper: solo las URLs antiguas exactas", () => {
    expect(legacyRedirectPath("/catalog")).toBe("/coleccion");
    expect(legacyRedirectPath("/es/catalog")).toBe("/coleccion");
    expect(legacyRedirectPath("/en/catalog")).toBe("/en/collection");
    for (const p of ["/", "/coleccion", "/en/collection", "/catalogo", "/catalog/x", "/admin/import"]) {
      expect(legacyRedirectPath(p)).toBeNull();
    }
  });

  test("308 conservando ?q= y los filtros", () => {
    expect(run("/catalog")).toMatchObject({ status: 308, location: "/coleccion" });
    expect(run("/catalog?q=l%C3%A1mpara&cat=deco")).toMatchObject({
      status: 308,
      location: "/coleccion?q=l%C3%A1mpara&cat=deco",
    });
    expect(run("/en/catalog?q=lamp")).toMatchObject({ status: 308, location: "/en/collection?q=lamp" });
    expect(run("/es/catalog?cat=textiles")).toMatchObject({ status: 308, location: "/coleccion?cat=textiles" });
  });
});

describe("admin fuera de la negociación de idioma (con pathnames)", () => {
  test("las rutas admin no se localizan", () => {
    for (const p of ["/admin", "/admin/login", "/admin/import", "/admin/ajustes"] as const) {
      expect(routing.pathnames[p]).toBe(p);
    }
  });

  test("con NEXT_LOCALE=en, /admin/** NO redirige a /en/admin (sin bucle)", () => {
    for (const p of ["/admin", "/admin/login", "/admin/import", "/admin/ajustes", "/admin/import?q=vela&page=2"]) {
      const r = run(p, EN_VISITOR);
      expect(r.location).toBeNull();
      expect(r.rewrite).toBe(`/es${p.split("?")[0]}`);
    }
  });

  test("/en/admin/** sigue volviendo a /admin/** (307)", () => {
    expect(run("/en/admin/import", EN_VISITOR)).toMatchObject({ status: 307, location: "/admin/import" });
  });

  test("/api/** no pasa por el middleware", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/api/admin/settings/margin")).toBe(false);
    expect(re.test("/api/stripe/webhook")).toBe(false);
    expect(re.test("/admin/import")).toBe(true);
    expect(re.test("/coleccion")).toBe(true);
  });
});

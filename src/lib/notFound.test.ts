import { describe, expect, test } from "bun:test";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

/**
 * 404 de marca: las rutas inexistentes del storefront caen en `[...rest]`, que
 * lanza notFound() (404 real, no 200) y pinta `(site)/not-found.tsx`; los
 * primeros segmentos que no son un locale no encajan en `[locale]` y van al 404
 * raíz. El estado HTTP se comprueba con curl contra `next start` (ver CLAUDE.md).
 */
describe("404 de marca", () => {
  test("la ruta comodín del storefront lanza notFound()", async () => {
    const { default: CatchAll } = await import("@/app/[locale]/(site)/[...rest]/page");
    let digest: unknown;
    try {
      CatchAll();
    } catch (e) {
      digest = (e as { digest?: unknown }).digest;
    }
    expect(digest).toBe("NEXT_NOT_FOUND");
  });

  test("solo los locales conocidos encajan en [locale]; el comodín acepta cualquier ruta", async () => {
    // El layout importa next/font (no se carga en bun test): se revisa su código.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/^export const dynamicParams = false;$/m);
    expect(src).toMatch(/routing\.locales\.map\(\(locale\) => \(\{ locale \}\)\)/);
    const rest = await import("@/app/[locale]/(site)/[...rest]/page");
    expect(rest.dynamicParams).toBe(true);
  });

  test("textos del 404 completos en ES y EN", () => {
    const keys = ["eyebrow", "title", "body", "home", "collection"] as const;
    expect(Object.keys(es.notFound).sort()).toEqual([...keys].sort());
    expect(Object.keys(en.notFound).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      expect(es.notFound[k].length).toBeGreaterThan(0);
      if (k !== "eyebrow") expect(en.notFound[k]).not.toBe(es.notFound[k]);
    }
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { isSiteNoindex, siteRobots } from "./seo";

const saved = process.env.SITE_NOINDEX;
afterEach(() => {
  if (saved === undefined) delete process.env.SITE_NOINDEX;
  else process.env.SITE_NOINDEX = saved;
});

describe("SITE_NOINDEX", () => {
  test("solo '1' activa el noindex", () => {
    expect(isSiteNoindex({ SITE_NOINDEX: "1" })).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes"]) expect(isSiteNoindex({ SITE_NOINDEX: v })).toBe(false);
  });

  test("metadata del layout raíz: robots noindex,nofollow solo con la variable", () => {
    expect(siteRobots({ SITE_NOINDEX: "1" })).toEqual({ robots: { index: false, follow: false } });
    expect(siteRobots({})).toEqual({});
  });

  test("next.config.mjs: X-Robots-Tag en TODAS las rutas solo con SITE_NOINDEX=1", async () => {
    const { default: config } = await import("../../next.config.mjs");
    const headersFn = (config as { headers?: () => Promise<unknown[]> }).headers;
    expect(typeof headersFn).toBe("function");

    process.env.SITE_NOINDEX = "1";
    expect(await headersFn!()).toEqual([
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ]);

    delete process.env.SITE_NOINDEX;
    expect(await headersFn!()).toEqual([]);
  });

  test("el layout raíz usa siteRobots() en su metadata", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/export const metadata: Metadata = \{\s*\/\/[^\n]*\n\s*\.\.\.siteRobots\(\),/);
  });
});

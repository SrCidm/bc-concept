import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import es from "../../messages/es.json";
import { ADMIN_CLIENT_NAMESPACES, SITE_CLIENT_NAMESPACES, pickMessages } from "./clientMessages";

/**
 * Los mensajes que llegan al navegador se recortan por zona. Este test vigila
 * las dos caras: (1) ningún componente cliente usa un namespace que su zona no
 * recibe (se rompería en producción) y (2) admin.* nunca entra en el storefront.
 */
const SRC = join(import.meta.dir, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const clientFiles = walk(SRC)
  .map((p) => ({ rel: relative(SRC, p).replace(/\\/g, "/"), src: readFileSync(p, "utf8") }))
  .filter((f) => /^\s*["']use client["']/m.test(f.src));

const isAdmin = (rel: string) => rel.startsWith("components/admin/") || rel.startsWith("app/[locale]/(admin)/");

describe("mensajes del cliente por zona", () => {
  test("cada useTranslations de un componente cliente está cubierto por su zona", () => {
    expect(clientFiles.length).toBeGreaterThan(5);
    const problems: string[] = [];
    for (const f of clientFiles) {
      const allowed: readonly string[] = isAdmin(f.rel) ? ADMIN_CLIENT_NAMESPACES : SITE_CLIENT_NAMESPACES;
      if (/useTranslations\(\s*\)/.test(f.src)) problems.push(`${f.rel}: useTranslations() sin namespace`);
      for (const m of f.src.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g)) {
        const root = m[1].split(".")[0];
        if (!allowed.includes(root)) problems.push(`${f.rel}: "${m[1]}" no llega a su zona`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("el storefront nunca recibe admin.*; el panel solo admin.*", () => {
    expect(SITE_CLIENT_NAMESPACES).not.toContain("admin" as never);
    const site = pickMessages(es, SITE_CLIENT_NAMESPACES);
    expect(Object.keys(site).sort()).toEqual([...SITE_CLIENT_NAMESPACES].sort());
    expect(JSON.stringify(site)).not.toContain(JSON.stringify(es.admin.login).slice(1, 40));
    expect(Object.keys(pickMessages(es, ADMIN_CLIENT_NAMESPACES))).toEqual(["admin"]);
  });

  test("los layouts usan el recorte (nunca getMessages() entero)", () => {
    const locale = readFileSync(join(SRC, "app/[locale]/layout.tsx"), "utf8");
    const admin = readFileSync(join(SRC, "app/[locale]/(admin)/admin/layout.tsx"), "utf8");
    expect(locale).toMatch(/pickMessages\(await getMessages\(\), SITE_CLIENT_NAMESPACES\)/);
    expect(admin).toMatch(/pickMessages\(await getMessages\(\), ADMIN_CLIENT_NAMESPACES\)/);
    for (const src of [locale, admin]) {
      expect(src).toMatch(/<NextIntlClientProvider messages=\{messages\}>/);
      expect(src).not.toMatch(/<NextIntlClientProvider>(?!\s*\{)/);
    }
  });
});

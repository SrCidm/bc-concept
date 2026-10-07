import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Regla #1: price_cost / coste jamás en superficies PÚBLICAS. Los módulos que
 * manejan coste de proveedor (suppliers, pricing, api/admin, requireAdmin) solo
 * pueden importarse desde /api/admin/** y entre sí; nunca desde el storefront,
 * ni desde componentes, ni desde la capa de catálogo público.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(ROOT, "src");

const COST_MODULES = [
  "@/lib/suppliers",
  "@/lib/pricing",
  "@/lib/api/admin",
  "@/lib/auth/requireAdmin",
  "@/types/cj.types",
  "@/lib/cj",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((f) => ({ path: f, rel: relative(SRC, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));

/** Quién puede importar módulos con coste. */
const ALLOWED = (rel: string) =>
  rel.startsWith("app/api/admin/") || // Route Handlers admin (tras requireAdmin)
  rel.startsWith("lib/suppliers/") ||
  rel.startsWith("lib/pricing/") ||
  rel.startsWith("lib/api/") ||
  rel.startsWith("lib/auth/") ||
  rel.startsWith("lib/cj/") ||
  rel.startsWith("types/");

describe("fronteras de la regla #1 (coste solo en superficies admin)", () => {
  test("ningún archivo público importa módulos con coste", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWED(f.rel)) continue;
      for (const mod of COST_MODULES) {
        const re = new RegExp(`from\\s+["']${mod.replace(/[/@.]/g, (c) => `\\${c}`)}`);
        if (re.test(f.src)) offenders.push(`${f.rel} importa ${mod}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("el storefront y la capa de catálogo público no mencionan price_cost ni 'wholesale'", () => {
    const publicFiles = files.filter(
      (f) =>
        f.rel.startsWith("app/[locale]/") ||
        f.rel.startsWith("lib/catalog/") ||
        f.rel.startsWith("components/") ||
        f.rel.startsWith("types/product")
    );
    const offenders = publicFiles
      .filter((f) => /price_cost|cost_currency|wholesale/i.test(f.src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  test("todo Route Handler de /api/admin llama a requireAdmin en su primera línea", () => {
    const routes = files.filter((f) => f.rel.startsWith("app/api/admin/") && f.rel.endsWith("/route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    // callback y logout son parte del flujo de login (aún no hay sesión): se excluyen.
    const guarded = routes.filter((f) => !f.rel.startsWith("app/api/admin/auth/"));
    expect(guarded.length).toBeGreaterThan(0);
    for (const f of guarded) {
      const handlers = f.src.match(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*\{\s*const admin = await requireAdmin\(\);\s*if \(!admin\.ok\) return admin\.response;/g) ?? [];
      const declared = f.src.match(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
      expect({ route: f.rel, guarded: handlers.length }).toEqual({ route: f.rel, guarded: declared.length });
    }
  });

  test("ningún componente cliente importa módulos server-only de proveedores", () => {
    const offenders = files
      .filter((f) => /^\s*["']use client["']/.test(f.src))
      .filter((f) => /@\/lib\/(suppliers|pricing|auth|api)\//.test(f.src) || /@\/lib\/supabase\/admin/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

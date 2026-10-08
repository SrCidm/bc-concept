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
  "@/lib/admin/",
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

/**
 * ÚNICA vía por la que la UI (componentes) puede tocar tipos del proveedor:
 * `import type` del archivo de tipos del DTO, sin `server-only` ni código. Se
 * elimina antes de aplicar las reglas de abajo; cualquier otro import sigue prohibido.
 */
const DTO_TYPES_IMPORT = /import\s+type\s+\{[^}]*\}\s+from\s+["']@\/lib\/suppliers\/dto\.types["'];?/g;

const files = walk(SRC).map((f) => {
  const rel = relative(SRC, f).split(sep).join("/");
  const raw = readFileSync(f, "utf8");
  // Solo los componentes del panel pueden usar la excepción de tipos.
  const src = rel.startsWith("components/admin/") ? raw.replace(DTO_TYPES_IMPORT, "") : raw;
  return { path: f, rel, src };
});

/** Quién puede importar módulos con coste. */
const ALLOWED = (rel: string) =>
  rel.startsWith("app/api/admin/") || // Route Handlers admin (tras requireAdmin)
  rel.startsWith("app/[locale]/(admin)/") || // área admin (páginas con requireAdminPage)
  rel.startsWith("lib/admin/") || // listAdminCatalog (auto-guardado)
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

  test("cada page.tsx del panel llama a requireAdminPage() en su primera línea (el layout NO basta)", () => {
    const panel = files.filter((f) => f.rel.startsWith("app/[locale]/(admin)/admin/(panel)/"));
    const pages = panel.filter((f) => f.rel.endsWith("/page.tsx"));
    expect(pages.length).toBeGreaterThan(0);
    const unguarded = pages
      .filter(
        (f) =>
          !/export default async function\s+\w*\s*\([^)]*\)\s*\{\s*(?:const\s+\w+\s*=\s*)?await requireAdminPage\(\)/.test(
            f.src
          )
      )
      .map((f) => f.rel);
    expect(unguarded).toEqual([]);
    // El layout también la llama (defensa en profundidad), pero no sustituye a las páginas.
    const layout = panel.find((f) => f.rel.endsWith("/(panel)/layout.tsx"));
    expect(layout?.src).toContain("requireAdminPage()");
  });

  test("las páginas del panel son Server Components (ni 'use client' ni datos desde el navegador)", () => {
    const clientPages = files
      .filter((f) => f.rel.startsWith("app/[locale]/(admin)/admin/(panel)/") && /\/(page|layout)\.tsx$/.test(f.rel))
      .filter((f) => /^\s*["']use client["']/.test(f.src))
      .map((f) => f.rel);
    expect(clientPages).toEqual([]);
  });

  test("el área admin NO hereda el cromo del storefront (Header/Footer solo en (site))", () => {
    const adminFiles = files.filter((f) => f.rel.startsWith("app/[locale]/(admin)/"));
    const leaking = adminFiles
      .filter((f) => /components\/layout\/(Header|Footer|FooterCurtain)/.test(f.src))
      .map((f) => f.rel);
    expect(leaking).toEqual([]);
    const site = files.find((f) => f.rel === "app/[locale]/(site)/layout.tsx");
    expect(site?.src).toMatch(/<Header\s*\/>/);
    expect(site?.src).toMatch(/<Footer\s*\/>/);
    const root = files.find((f) => f.rel === "app/[locale]/layout.tsx");
    expect(root?.src).not.toMatch(/<Header\s*\/>|<Footer\s*\/>/);
  });

  test("ningún componente cliente importa módulos server-only de proveedores", () => {
    const offenders = files
      .filter((f) => /^\s*["']use client["']/.test(f.src))
      .filter((f) => /@\/lib\/(suppliers|pricing|auth|api)\//.test(f.src) || /@\/lib\/supabase\/admin/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  test("dto.types.ts es client-safe: solo `import type`, sin server-only ni código con efectos", () => {
    const f = files.find((x) => x.rel === "lib/suppliers/dto.types.ts");
    expect(f).toBeDefined();
    const code = f!.src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toContain("server-only");
    const imports = code.match(/^\s*import.*$/gm) ?? [];
    for (const line of imports) expect(line).toMatch(/^\s*import\s+type/);
    expect(code).not.toMatch(/export\s+(const|let|var|function|class|enum)/);
  });

  test("el mock de BigBuy solo lo importa el registro (que lo ignora en producción)", () => {
    const importers = files
      .filter((f) => !f.rel.startsWith("lib/suppliers/bigbuy/mock/"))
      .filter((f) => /from\s+["'][^"']*\/mock\/(catalog|transport)["']/.test(f.src))
      .map((f) => f.rel);
    expect(importers).toEqual(["lib/suppliers/registry.ts"]);
  });
});

import "server-only";
import { parseProductsQuery } from "@/lib/api/admin";
import type { AdminCatalogQuery } from "./catalog";

/**
 * Estado del buscador de /admin/import, guardado en la URL (compartible, botón
 * atrás correcto): `?q=&page=&eu=0&stock=0`. Por defecto "solo almacén UE" y
 * "solo con stock" están activos; la URL solo lleva `eu=0` / `stock=0` cuando se
 * apagan. Se valida con el mismo `parseProductsQuery` que la API: lo que está
 * fuera de rango se rechaza, no se "corrige".
 */

export const IMPORT_PAGE_SIZE = 24;

export interface ImportUiState {
  q: string;
  page: number;
  eu: boolean;
  stock: boolean;
}

export type ImportParams =
  | { ok: true; query: AdminCatalogQuery; ui: ImportUiState }
  | { ok: false };

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Con parámetros repetidos (`eu=0&eu=1`, p. ej. el envío nativo del formulario) gana el último. */
function last(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v.length ? v[v.length - 1] : null;
  return v ?? null;
}

export function parseImportParams(sp: RawSearchParams): ImportParams {
  const q = last(sp.q)?.trim() ?? "";
  const eu = last(sp.eu) !== "0";
  const stock = last(sp.stock) !== "0";

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const page = last(sp.page);
  if (page !== null && page !== "") params.set("page", page);
  params.set("pageSize", String(IMPORT_PAGE_SIZE));
  if (!eu) params.set("euOnly", "false");
  if (!stock) params.set("inStockOnly", "false");

  try {
    const query = parseProductsQuery(params);
    return { ok: true, query, ui: { q: query.query ?? "", page: query.page, eu, stock } };
  } catch {
    return { ok: false };
  }
}

/** Query string canónico (sin valores por defecto) para enlaces y `key` de Suspense. */
export function importQueryString(ui: Partial<ImportUiState>): string {
  const p = new URLSearchParams();
  if (ui.q) p.set("q", ui.q);
  if (ui.page && ui.page > 1) p.set("page", String(ui.page));
  if (ui.eu === false) p.set("eu", "0");
  if (ui.stock === false) p.set("stock", "0");
  return p.toString();
}

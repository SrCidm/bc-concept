import "server-only";
import { NextResponse } from "next/server";
import { SupplierError, isSupplierError } from "@/lib/suppliers/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** JSON sin caché (datos de admin / credenciales: nunca se cachean). */
export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Traduce cualquier error a una respuesta segura (regla #8): SupplierError →
 * su código/estado con mensaje fijo; cualquier otro → 500 genérico. Nunca se
 * devuelve el cuerpo, las cabeceras ni la URL del proveedor, ni el error crudo.
 */
export function adminErrorResponse(e: unknown): NextResponse {
  if (isSupplierError(e)) {
    return NextResponse.json(e.toJSON(), { status: e.status, headers: NO_STORE });
  }
  console.error("[admin api] unexpected error");
  return NextResponse.json(
    { error: { code: "internal", message: "Ha ocurrido un error. Inténtalo de nuevo." } },
    { status: 500, headers: NO_STORE }
  );
}

/**
 * Defensa en profundidad contra CSRF en métodos que escriben: los navegadores
 * mandan `Origin` en fetch no-GET; debe coincidir con el host de la petición.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = Boolean(origin && host && new URL(origin).host === host);
  } catch {
    ok = false;
  }
  if (!ok) throw new SupplierError("invalid_request");
}

const CATEGORY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export interface ProductsQuery {
  page: number;
  pageSize: number;
  category?: string;
  query?: string;
  lang: "es" | "en";
  euOnly: boolean;
  inStockOnly: boolean;
}

function intParam(raw: string | null, def: number, min: number, max: number): number {
  if (raw === null || raw === "") return def;
  if (!/^\d{1,6}$/.test(raw)) throw new SupplierError("invalid_request");
  const n = Number(raw);
  if (n < min || n > max) throw new SupplierError("invalid_request");
  return n;
}

/** Valida (no "corrige") los parámetros: fuera de rango → 400. */
export function parseProductsQuery(params: URLSearchParams): ProductsQuery {
  const category = params.get("category");
  if (category !== null && !CATEGORY_PATTERN.test(category)) {
    throw new SupplierError("invalid_request");
  }
  const query = params.get("q")?.trim();
  if (query && query.length > 80) throw new SupplierError("invalid_request");
  const lang = params.get("lang") ?? "es";
  if (lang !== "es" && lang !== "en") throw new SupplierError("invalid_request");

  return {
    page: intParam(params.get("page"), 1, 1, 10_000),
    pageSize: intParam(params.get("pageSize"), 24, 1, 100),
    category: category ?? undefined,
    query: query || undefined,
    lang,
    euOnly: params.get("euOnly") !== "false",
    inStockOnly: params.get("inStockOnly") !== "false",
  };
}

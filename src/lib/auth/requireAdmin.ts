import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda de administración. Fail-closed:
 *   · sin sesión válida                       → 401
 *   · sesión sin email confirmado             → 403
 *   · email fuera de ADMIN_EMAILS (o la lista
 *     vacía / sin definir)                    → 403
 * La sesión se valida contra Supabase Auth (`getUser`, no `getSession`: no se
 * confía en la cookie sin verificar el JWT).
 *
 * Tres puntos de entrada sobre la MISMA decisión (`resolveAdmin`):
 *   · requireAdmin()      — Route Handlers bajo /api/admin (primera línea; el
 *                           middleware i18n excluye /api: sin esto serían públicos).
 *   · requireAdminPage()  — páginas del panel. Cada page.tsx la llama ella misma:
 *                           los layouts de Next NO se re-ejecutan en navegación
 *                           cliente, así que un layout no es frontera de seguridad.
 *   · resolveAdmin()      — decisión pura, para quien necesite comprobar sin
 *                           redirigir (p. ej. listAdminCatalog en la Fase B).
 */

export interface AdminUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

export type AdminDecision =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      status: 401 | 403;
      code: "unauthenticated" | "forbidden";
      message: string;
      /** Email de la sesión (solo en 403), para que la página de login lo muestre. */
      email: string | null;
    };

export type AdminAuth =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse };

export interface RequireAdminDeps {
  getUser?: () => Promise<AdminUser | null>;
  /** Por defecto process.env.ADMIN_EMAILS (lista separada por comas). */
  adminEmails?: string | undefined;
}

export function parseAdminEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  );
}

async function defaultGetUser(): Promise<AdminUser | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
}

/** Decisión pura y fail-closed. No redirige ni construye respuestas. */
export async function resolveAdmin(deps: RequireAdminDeps = {}): Promise<AdminDecision> {
  let user: AdminUser | null = null;
  try {
    user = await (deps.getUser ?? defaultGetUser)();
  } catch {
    // Si Auth no responde, se deniega (nunca se abre por error).
    user = null;
  }
  if (!user) {
    return { ok: false, status: 401, code: "unauthenticated", message: "Inicia sesión para continuar.", email: null };
  }

  const allowed = parseAdminEmails("adminEmails" in deps ? deps.adminEmails : process.env.ADMIN_EMAILS);
  // Misma normalización que la lista (trim + lowercase) en ambos lados.
  const email = user.email?.trim().toLowerCase() || null;
  if (!email || !user.emailConfirmed || allowed.size === 0 || !allowed.has(email)) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "No tienes permiso para acceder aquí.",
      email: user.email?.trim() || null,
    };
  }
  return { ok: true, userId: user.id, email };
}

/** Route Handlers: primera línea de cada handler bajo /api/admin. */
export async function requireAdmin(deps: RequireAdminDeps = {}): Promise<AdminAuth> {
  const decision = await resolveAdmin(deps);
  if (decision.ok) return decision;
  return {
    ok: false,
    response: NextResponse.json(
      { error: { code: decision.code, message: decision.message } },
      { status: decision.status, headers: { "Cache-Control": "no-store" } }
    ),
  };
}

export const ADMIN_LOGIN_PATH = "/admin/login";

export interface RequireAdminPageDeps extends RequireAdminDeps {
  /** Inyectable para tests; por defecto `redirect` de Next (lanza, no vuelve). */
  redirectTo?: (path: string) => never;
}

/**
 * Páginas y layouts del panel. Sin sesión de admin redirige a /admin/login (el
 * admin es solo ES: sin prefijo de idioma). Hay que llamarla en CADA page.tsx
 * (un test lo exige), no solo en el layout.
 */
export async function requireAdminPage(
  deps: RequireAdminPageDeps = {}
): Promise<{ userId: string; email: string }> {
  const decision = await resolveAdmin(deps);
  if (!decision.ok) (deps.redirectTo ?? redirect)(ADMIN_LOGIN_PATH);
  // Tras `redirect` (que lanza) no se llega aquí; el estrechamiento es para TS.
  if (!decision.ok) throw new Error("unreachable");
  return { userId: decision.userId, email: decision.email };
}

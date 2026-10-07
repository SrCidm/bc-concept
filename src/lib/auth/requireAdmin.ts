import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda de administración. Debe ser la PRIMERA línea de cada Route Handler
 * bajo /api/admin (el middleware i18n excluye /api: sin esto la ruta sería
 * pública). Es fail-closed:
 *   · sin sesión válida                       → 401
 *   · sesión sin email confirmado             → 403
 *   · email fuera de ADMIN_EMAILS (o la lista
 *     vacía / sin definir)                    → 403
 * La sesión se valida contra Supabase Auth (`getUser`, no `getSession`: no se
 * confía en la cookie sin verificar el JWT).
 */

export interface AdminUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

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

function denied(status: 401 | 403, code: "unauthenticated" | "forbidden", message: string): AdminAuth {
  return {
    ok: false,
    response: NextResponse.json(
      { error: { code, message } },
      { status, headers: { "Cache-Control": "no-store" } }
    ),
  };
}

export async function requireAdmin(deps: RequireAdminDeps = {}): Promise<AdminAuth> {
  let user: AdminUser | null = null;
  try {
    user = await (deps.getUser ?? defaultGetUser)();
  } catch {
    // Si Auth no responde, se deniega (nunca se abre por error).
    user = null;
  }
  if (!user) return denied(401, "unauthenticated", "Inicia sesión para continuar.");

  const allowed = parseAdminEmails("adminEmails" in deps ? deps.adminEmails : process.env.ADMIN_EMAILS);
  // Misma normalización que la lista (trim + lowercase) en ambos lados.
  const email = user.email?.trim().toLowerCase() || null;
  if (!email || !user.emailConfirmed || allowed.size === 0 || !allowed.has(email)) {
    return denied(403, "forbidden", "No tienes permiso para acceder aquí.");
  }
  return { ok: true, userId: user.id, email };
}

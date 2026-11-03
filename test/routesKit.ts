import { NextResponse } from "next/server";
import type { AdminAuth, AdminDecision } from "@/lib/auth/requireAdmin";
import { createCjAdapter } from "@/lib/suppliers/cj";
import type { SupplierAdapter } from "@/lib/suppliers/types";

/**
 * Piezas comunes de los tests de rutas admin: la sesión se PASA a las factorías
 * (`supplierRoutes`, `settingsRoutes`, `productRoutes`), nunca se sustituye el
 * módulo, así que los tests no dependen del orden en que se ejecuten.
 */

export type Session = "none" | "admin" | "forbidden";

export const ADMIN_EMAIL = "yosra@example.com";

/** La guarda de la ruta (`requireAdmin`) para una sesión dada. */
export function requireAdminAs(get: () => Session): () => Promise<AdminAuth> {
  return async (): Promise<AdminAuth> => {
    const s = get();
    if (s === "admin") return { ok: true, userId: "u1", email: ADMIN_EMAIL };
    const status = s === "forbidden" ? 403 : 401;
    const code = s === "forbidden" ? "forbidden" : "unauthenticated";
    return { ok: false, response: NextResponse.json({ error: { code } }, { status }) };
  };
}

/** La re-comprobación de lib/admin (`resolveAdmin`) para una sesión dada. */
export function resolveAs(get: () => Session): () => Promise<AdminDecision> {
  return async (): Promise<AdminDecision> => {
    const s = get();
    if (s === "admin") return { ok: true, userId: "u1", email: ADMIN_EMAIL };
    return s === "forbidden"
      ? { ok: false, status: 403, code: "forbidden", message: "x", email: "otro@example.com" }
      : { ok: false, status: 401, code: "unauthenticated", message: "x", email: null };
  };
}

/** CJ sin API key ni sesión guardada: falla con `not_configured` sin salir a la red. */
export function cjWithoutKey(): SupplierAdapter {
  return createCjAdapter({
    getApiKey: async () => null,
    tokenStore: { load: async () => null, save: async () => {} },
    authState: { current: null, loadedAt: 0, rejected: null, inflight: null },
    curatedIndex: { value: null, inflight: null },
    queue: { tail: Promise.resolve(), lastFinishedAt: 0 },
    sleep: async () => {},
    fetchImpl: (async () => {
      throw new Error("test: CJ sin key no debe llamar a la red");
    }) as unknown as typeof fetch,
  });
}

export const SAME_ORIGIN = { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" };

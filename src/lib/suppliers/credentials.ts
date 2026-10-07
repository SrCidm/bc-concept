import "server-only";
import type { SupplierId } from "./types";

/**
 * Credenciales de proveedor en `supplier_credentials` (RLS + REVOKE ALL a
 * anon/authenticated → solo service role). La API key NUNCA sale de este
 * módulo hacia una respuesta: solo `resolveApiKey` la entrega, y solo a los
 * adaptadores (server-only).
 */

export interface StoredCredential {
  apiKey: string | null;
  updatedAt: string | null;
}

/** Almacén abstracto: Supabase en producción, en memoria en los tests. */
export interface CredentialStore {
  get(supplier: SupplierId): Promise<StoredCredential | null>;
  setApiKey(supplier: SupplierId, apiKey: string): Promise<{ updatedAt: string }>;
  delete(supplier: SupplierId): Promise<void>;
}

export type CredentialSource = "db" | "env" | "none";

export interface CredentialStatus {
  configured: boolean;
  source: CredentialSource;
  updatedAt: string | null;
}

const ENV_KEYS: Record<SupplierId, string> = {
  bigbuy: "BIGBUY_API_KEY",
  cj: "CJ_API_KEY",
};

export function envApiKey(
  supplier: SupplierId,
  env: Record<string, string | undefined> = process.env
): string | null {
  const v = env[ENV_KEYS[supplier]]?.trim();
  return v ? v : null;
}

/** Cliente admin creado de forma perezosa: importar este módulo no exige env. */
async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin;
}

export const supabaseCredentialStore: CredentialStore = {
  async get(supplier) {
    const db = await admin();
    const { data, error } = await db
      .from("supplier_credentials")
      .select("api_key, updated_at")
      .eq("supplier", supplier)
      .maybeSingle();
    if (error) {
      // Solo el código: el mensaje de PostgREST puede incluir detalles internos.
      console.error("[suppliers] credential read failed:", error.code);
      throw new Error("credential_store_unavailable");
    }
    if (!data) return null;
    return { apiKey: (data.api_key as string | null) ?? null, updatedAt: (data.updated_at as string | null) ?? null };
  },

  async setApiKey(supplier, apiKey) {
    const db = await admin();
    const { data, error } = await db
      .from("supplier_credentials")
      .upsert({ supplier, api_key: apiKey }, { onConflict: "supplier" })
      .select("updated_at")
      .single();
    if (error) {
      console.error("[suppliers] credential write failed:", error.code);
      throw new Error("credential_store_unavailable");
    }
    return { updatedAt: data.updated_at as string };
  },

  async delete(supplier) {
    const db = await admin();
    // Quita la key; si la fila no guarda tokens de otro tipo, se borra entera.
    const { error } = await db
      .from("supplier_credentials")
      .update({ api_key: null })
      .eq("supplier", supplier);
    if (error) {
      console.error("[suppliers] credential delete failed:", error.code);
      throw new Error("credential_store_unavailable");
    }
    await db
      .from("supplier_credentials")
      .delete()
      .eq("supplier", supplier)
      .is("access_token", null)
      .is("refresh_token", null);
  },
};

/**
 * La key de BD GANA sobre la del entorno: así se puede rotar desde el panel sin
 * redeploy. El entorno es el valor de arranque. Sin ninguna → null.
 */
export async function resolveApiKey(
  supplier: SupplierId,
  deps: { store?: CredentialStore; env?: Record<string, string | undefined> } = {}
): Promise<string | null> {
  const store = deps.store ?? supabaseCredentialStore;
  const stored = await store.get(supplier);
  if (stored?.apiKey) return stored.apiKey;
  return envApiKey(supplier, deps.env);
}

/** Estado SIN la key (apto para devolver al admin). */
export async function getCredentialStatus(
  supplier: SupplierId,
  deps: { store?: CredentialStore; env?: Record<string, string | undefined> } = {}
): Promise<CredentialStatus> {
  const store = deps.store ?? supabaseCredentialStore;
  const stored = await store.get(supplier);
  if (stored?.apiKey) return { configured: true, source: "db", updatedAt: stored.updatedAt };
  if (envApiKey(supplier, deps.env)) return { configured: true, source: "env", updatedAt: null };
  return { configured: false, source: "none", updatedAt: null };
}

export async function setApiKey(
  supplier: SupplierId,
  apiKey: string,
  deps: { store?: CredentialStore } = {}
): Promise<{ updatedAt: string }> {
  return (deps.store ?? supabaseCredentialStore).setApiKey(supplier, apiKey);
}

export async function deleteApiKey(
  supplier: SupplierId,
  deps: { store?: CredentialStore } = {}
): Promise<void> {
  return (deps.store ?? supabaseCredentialStore).delete(supplier);
}

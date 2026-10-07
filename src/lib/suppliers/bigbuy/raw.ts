import "server-only";

/**
 * ⚠️ FORMA DE RESPUESTA DE BIGBUY — SUPUESTA (a validar con la key).
 *
 * No hay tipos "crudos" estrictos a propósito: cada respuesta se lee con estos
 * lectores defensivos, así que un campo ausente o con otro tipo produce `null`
 * y no una excepción. Cuando llegue la key y se vea la respuesta real, basta
 * con ajustar `mappers.ts`.
 */

export type Rec = Record<string, unknown>;

export const rec = (v: unknown): Rec | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null;

export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function text(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Acepta `[...]` o `{ <clave>: [...] }` (algunas APIs envuelven la lista). */
export function listFrom(v: unknown, wrapperKey: string): unknown[] {
  if (Array.isArray(v)) return v;
  const r = rec(v);
  return r ? list(r[wrapperKey]) : [];
}

/** Indexa una lista de objetos por su `id` (como texto). */
export function indexById(items: unknown[]): Map<string, Rec> {
  const out = new Map<string, Rec>();
  for (const item of items) {
    const r = rec(item);
    const id = r ? text(r.id) : null;
    if (r && id) out.set(id, r);
  }
  return out;
}

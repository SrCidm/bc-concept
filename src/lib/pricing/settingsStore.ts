import "server-only";
import type { MarginValuesDTO } from "@/lib/admin/settings.types";

/**
 * Almacén de `margin_settings` (Supabase, service role). SOLO INSERCIÓN: este
 * módulo no tiene (ni debe tener) actualizar ni borrar; la BD además lo impide
 * con grants y un trigger (migration_v2_5_margin_settings.sql). La vigente es
 * la fila más reciente.
 *
 * En los tests se sustituye por uno en memoria (test/setup.ts): nunca se lee
 * ni se escribe la BD real desde `bun test`.
 */

export interface MarginSettingsRecord {
  id: number;
  /** Tal cual vienen de la BD; se validan al usarlos (`parseMarginSettingsValues`). */
  values: Record<keyof MarginValuesDTO, unknown>;
  createdBy: string;
  /** ISO 8601. */
  createdAt: string;
  note: string | null;
}

export interface NewMarginSettingsRecord {
  values: MarginValuesDTO;
  createdBy: string;
  note: string | null;
}

export interface MarginSettingsStore {
  latest(): Promise<MarginSettingsRecord | null>;
  /** Más reciente primero. */
  history(limit: number): Promise<MarginSettingsRecord[]>;
  insert(row: NewMarginSettingsRecord): Promise<MarginSettingsRecord>;
}

const COLUMNS =
  "id, returns_buffer_pct, shipping_cost_default, acquisition_cost, min_margin_pct, target_max_pct, stripe_pct, stripe_fixed, created_by, created_at, note";

type Row = Record<string, unknown>;

function fromRow(r: Row): MarginSettingsRecord {
  return {
    id: Number(r.id),
    values: {
      returnsBufferPct: r.returns_buffer_pct,
      shippingCost: r.shipping_cost_default,
      acquisitionCost: r.acquisition_cost,
      targetMinPct: r.min_margin_pct,
      targetMaxPct: r.target_max_pct,
      stripePct: r.stripe_pct,
      stripeFixed: r.stripe_fixed,
    },
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at ?? ""),
    note: typeof r.note === "string" ? r.note : null,
  };
}

/** Cliente admin creado de forma perezosa: importar este módulo no exige env. */
async function db() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin;
}

function fail(op: string, code: unknown): never {
  // Solo el código: el mensaje de PostgREST puede incluir detalles internos.
  console.error(`[margin settings] ${op} failed:`, code);
  throw new Error("margin_settings_unavailable");
}

export const supabaseMarginSettingsStore: MarginSettingsStore = {
  async latest() {
    const { data, error } = await (await db())
      .from("margin_settings")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("read", error.code);
    return data ? fromRow(data as Row) : null;
  },

  async history(limit) {
    const { data, error } = await (await db())
      .from("margin_settings")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(Math.max(1, limit), 50));
    if (error) fail("history", error.code);
    return (data ?? []).map((r) => fromRow(r as Row));
  },

  async insert(row) {
    const { data, error } = await (await db())
      .from("margin_settings")
      .insert({
        returns_buffer_pct: row.values.returnsBufferPct,
        shipping_cost_default: row.values.shippingCost,
        acquisition_cost: row.values.acquisitionCost,
        min_margin_pct: row.values.targetMinPct,
        target_max_pct: row.values.targetMaxPct,
        stripe_pct: row.values.stripePct,
        stripe_fixed: row.values.stripeFixed,
        created_by: row.createdBy,
        note: row.note,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) fail("insert", error?.code);
    return fromRow(data as Row);
  },
};

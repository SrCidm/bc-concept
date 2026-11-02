import "server-only";

/**
 * Almacén de `fx_rates` (Supabase, service role). SOLO INSERCIÓN: la BD además lo
 * impide con grants y triggers (migration_v2_6_cj_fx.sql).
 *
 * En los tests se sustituye por uno vacío (test/setup.ts): `bun test` nunca lee ni
 * escribe la BD real.
 */
export interface StoredFxRate {
  rate: number;
  /** Fecha de publicación del tipo (AAAA-MM-DD). */
  rateDate: string;
  /** ISO 8601: cuándo se consultó. */
  fetchedAt: string;
}

export interface FxStore {
  /** El tipo más reciente de USD→EUR, o null. */
  latest(): Promise<StoredFxRate | null>;
  /** Guarda un tipo; si esa fecha ya existe no hace nada. */
  insert(rate: { rate: number; rateDate: string }): Promise<void>;
}

async function db() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin;
}

export const supabaseFxStore: FxStore = {
  async latest() {
    const { data, error } = await (await db())
      .from("fx_rates")
      .select("rate, rate_date, fetched_at")
      .eq("base", "USD")
      .eq("quote", "EUR")
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[fx] read failed:", error.code);
      throw new Error("fx_store_unavailable");
    }
    if (!data) return null;
    return { rate: Number(data.rate), rateDate: String(data.rate_date), fetchedAt: String(data.fetched_at) };
  },

  async insert({ rate, rateDate }) {
    const { error } = await (await db())
      .from("fx_rates")
      .upsert({ base: "USD", quote: "EUR", rate, rate_date: rateDate }, { onConflict: "base,quote,rate_date", ignoreDuplicates: true });
    if (error) {
      console.error("[fx] write failed:", error.code);
      throw new Error("fx_store_unavailable");
    }
  },
};

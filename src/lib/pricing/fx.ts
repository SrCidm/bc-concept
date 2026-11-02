import "server-only";
import type { FxStore, StoredFxRate } from "./fxStore";

/**
 * Tipo de cambio USD→EUR para los costes de proveedores que cobran en dólares.
 *
 *   coste EUR de la guarda = coste USD × tipo BCE × (1 + colchón de cambio)
 *
 * El tipo es el oficial del BCE (vía Frankfurter), como mucho una consulta al día
 * por proceso, y se guarda en BD con su fecha. Si la consulta falla se usa el
 * último guardado de menos de 7 días y el panel avisa de su antigüedad. Sin tipo o
 * con uno más antiguo: fail-closed, sin margen ni importación. Nunca uno inventado.
 *
 * El BCE no publica en fin de semana ni festivos: que el tipo sea de hace 1-3 días
 * es normal y solo se avisa si ha fallado la consulta (`stale`).
 */
export const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";
/** Antigüedad máxima (días, exclusive) de un tipo para seguir usándolo. */
export const FX_MAX_AGE_DAYS = 7;
/** Colchón de cambio por defecto, en % (editable en /admin/ajustes). */
export const DEFAULT_FX_BUFFER_PCT = 3;

const DAY_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 5000;
/** Una consulta correcta vale un día. */
const FRESH_MS = DAY_MS;
/** Tras un fallo no se reintenta a cada petición. */
const RETRY_AFTER_FAILURE_MS = 15 * 60_000;
/** Cuánto se reutiliza la respuesta en memoria antes de volver a mirar la BD. */
const MEMORY_TTL_MS = 10 * 60_000;
/** Límites de cordura para USD→EUR: fuera de aquí la respuesta no es de fiar. */
const MIN_SANE_RATE = 0.3;
const MAX_SANE_RATE = 3;

export type FxQuote =
  | {
      ok: true;
      rate: number;
      /** Fecha de publicación (AAAA-MM-DD). */
      rateDate: string;
      /** Días desde la publicación. */
      ageDays: number;
      /** Falló la consulta y se está usando el último guardado. */
      stale: boolean;
    }
  | { ok: false };

export interface FxSource {
  get(): Promise<FxQuote>;
}

/** Coste en EUR para la guarda (con colchón), redondeado al céntimo. */
export function usdToEurCost(amountUsd: number, rate: number, bufferPct: number): number {
  return Math.round(amountUsd * rate * (1 + bufferPct / 100) * 100) / 100;
}

/** Referencia en EUR, sin colchón (p. ej. el PVP recomendado por el proveedor). */
export function usdToEur(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}

function ageInDays(rateDate: string, now: number): number {
  const published = Date.parse(`${rateDate}T00:00:00Z`);
  const today = Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((today - published) / DAY_MS);
}

/** Lee la respuesta de Frankfurter. Cualquier cosa rara → null (nunca un tipo dudoso). */
export function parseFrankfurter(json: unknown): { rate: number; rateDate: string } | null {
  if (typeof json !== "object" || json === null) return null;
  const { date, rates, base } = json as { date?: unknown; rates?: { EUR?: unknown }; base?: unknown };
  if (base !== "USD" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return null;
  const rate = rates?.EUR;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < MIN_SANE_RATE || rate > MAX_SANE_RATE) return null;
  return { rate, rateDate: date };
}

export function createFxSource(deps: {
  store: FxStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): FxSource {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  let memory: { at: number; quote: FxQuote } | null = null;
  let lastFailureAt = 0;

  async function fetchRate(): Promise<{ rate: number; rateDate: string } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(FX_URL, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) return null;
      return parseFrankfurter(await res.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readStore(): Promise<StoredFxRate | null> {
    try {
      const row = await deps.store.latest();
      return row && Number.isFinite(row.rate) && row.rate > 0 ? row : null;
    } catch {
      console.error("[fx] no se pudo leer el último tipo guardado");
      return null;
    }
  }

  /** Solo vale si no es futuro ni tiene 7 días o más. */
  function quote(rate: number, rateDate: string, stale: boolean): FxQuote {
    const ageDays = ageInDays(rateDate, now());
    return Number.isFinite(ageDays) && ageDays >= 0 && ageDays < FX_MAX_AGE_DAYS
      ? { ok: true, rate, rateDate, ageDays, stale }
      : { ok: false };
  }

  async function resolve(): Promise<FxQuote> {
    const stored = await readStore();
    if (stored && now() - Date.parse(stored.fetchedAt) < FRESH_MS) {
      return quote(stored.rate, stored.rateDate, false);
    }

    const canRetry = now() - lastFailureAt >= RETRY_AFTER_FAILURE_MS;
    const fresh = canRetry ? await fetchRate() : null;
    if (fresh) {
      const q = quote(fresh.rate, fresh.rateDate, false);
      if (q.ok) {
        try {
          await deps.store.insert(fresh);
        } catch {
          // El tipo es real: se usa aunque no se haya podido guardar.
          console.error("[fx] no se pudo guardar el tipo");
        }
        return q;
      }
    }
    if (canRetry) lastFailureAt = now();

    return stored ? quote(stored.rate, stored.rateDate, true) : { ok: false };
  }

  return {
    async get() {
      if (memory && now() - memory.at < MEMORY_TTL_MS) {
        // La antigüedad cambia con los días, aunque la respuesta esté en memoria.
        const m = memory.quote;
        return m.ok ? quote(m.rate, m.rateDate, m.stale) : m;
      }
      const q = await resolve();
      memory = { at: now(), quote: q };
      return q;
    },
  };
}

const lazyStore: FxStore = {
  latest: async () => (await import("./fxStore")).supabaseFxStore.latest(),
  insert: async (r) => (await import("./fxStore")).supabaseFxStore.insert(r),
};

const GLOBAL_KEY = "__bcFxSource";

/** Una fuente por proceso, en `globalThis`: Next empaqueta cada ruta por separado. */
export function fxSource(): FxSource {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: FxSource };
  g[GLOBAL_KEY] ??= createFxSource({ store: lazyStore });
  return g[GLOBAL_KEY];
}

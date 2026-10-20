import "server-only";
import type { MarginValuesDTO } from "@/lib/admin/settings.types";
import type { MarginParams } from "./margin";
import { parseMarginSettingsValues } from "./settingsInput";
import type { MarginSettingsRecord, MarginSettingsStore } from "./settingsStore";

/**
 * Ajustes de la guarda de margen. ÚNICO punto de cableado: la UI de importación
 * nunca ve estos parámetros (solo el resultado de la guarda), así que cambiar de
 * dónde salen no la toca.
 *
 * Precedencia (3.4a): última fila de `margin_settings` (la edita Yosra en
 * /admin/ajustes) > variables `MARGIN_*` > valores por defecto de código.
 * Si la BD falla se usan entorno/defaults y se marca `degraded` (el panel lo
 * avisa). Nunca NaN: la fila se valida al leerla y una fila corrupta = fallo.
 * El IVA es fijo en código (`VAT_PCT`): ni BD ni entorno lo cambian.
 */

/** IVA sobre el PVP (el PVP se guarda con IVA incluido). Fijo: no es un ajuste editable. */
export const VAT_PCT = 21;

/**
 * VALORES POR DEFECTO (a validar con Yosra; el panel permite cambiarlos):
 *  · Stripe 1,5 % del PVP + 0,25 € por cobro.
 *  · Colchón de devoluciones 6 % de los ingresos netos (PVP sin IVA). Las
 *    instrucciones del proyecto fijan 5–8 % para decoración; se toma 6 %.
 *  · Envío medio a cargo de B&C 4,50 €/pedido (respaldo: en 3.4 vendrá por
 *    producto desde BigBuy).
 *  · Coste de adquisición (ads) 0 € por pedido.
 *  · Margen neto mínimo 15 % (guarda) y objetivo máximo 35 % (informativo):
 *    "Objetivo neto 15-35 %" del CLAUDE.md.
 */
export const DEFAULT_MARGIN_PARAMS: Readonly<MarginParams> = Object.freeze({
  vatPct: VAT_PCT,
  shippingCost: 4.5,
  stripePct: 1.5,
  stripeFixed: 0.25,
  returnsBufferPct: 6,
  acquisitionCost: 0,
  targetMinPct: 15,
  targetMaxPct: 35,
});

/** De dónde salen los parámetros. Asíncrono: la fuente de BD encaja sin cambiar a quien la usa. */
export interface MarginSettingsSource {
  get(): Promise<MarginParams>;
}

type EditableKey = Exclude<keyof MarginParams, "vatPct">;

/** Sin MARGIN_VAT_PCT: el IVA es fijo en código. */
const PARAM_ENV: Record<EditableKey, string> = {
  shippingCost: "MARGIN_SHIPPING_EUR",
  stripePct: "MARGIN_STRIPE_PCT",
  stripeFixed: "MARGIN_STRIPE_FIXED_EUR",
  returnsBufferPct: "MARGIN_RETURNS_BUFFER_PCT",
  acquisitionCost: "MARGIN_ACQUISITION_EUR",
  targetMinPct: "MARGIN_TARGET_MIN_PCT",
  targetMaxPct: "MARGIN_TARGET_MAX_PCT",
};

const PERCENT_KEYS: ReadonlySet<EditableKey> = new Set<EditableKey>([
  "stripePct",
  "returnsBufferPct",
  "targetMinPct",
  "targetMaxPct",
]);

type Env = Record<string, string | undefined>;

function fromEnv(env: Env, defaults: Readonly<MarginParams>): { params: MarginParams; applied: boolean } {
  const out: MarginParams = { ...defaults, vatPct: VAT_PCT };
  let applied = false;
  for (const [key, envName] of Object.entries(PARAM_ENV) as [EditableKey, string][]) {
    const raw = env[envName]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    const ok = Number.isFinite(n) && n >= 0 && (!PERCENT_KEYS.has(key) || n <= 100);
    if (!ok) {
      console.warn(`[margin] ${envName} no es válido; se usa el valor por defecto`);
      continue;
    }
    out[key] = n;
    applied = true;
  }
  if (out.targetMinPct > out.targetMaxPct) {
    console.warn("[margin] MARGIN_TARGET_MIN_PCT > MARGIN_TARGET_MAX_PCT; se usan los objetivos por defecto");
    out.targetMinPct = defaults.targetMinPct;
    out.targetMaxPct = defaults.targetMaxPct;
  }
  return { params: out, applied };
}

/**
 * Defaults + overrides opcionales `MARGIN_*` del entorno. Un valor inválido se
 * IGNORA (se registra solo el nombre de la variable, nunca el valor); el
 * resultado nunca contiene NaN. El IVA siempre es `VAT_PCT`.
 */
export function marginParamsFromEnv(
  env: Env = process.env,
  defaults: Readonly<MarginParams> = DEFAULT_MARGIN_PARAMS
): MarginParams {
  return fromEnv(env, defaults).params;
}

/** Valores editables → parámetros completos de la guarda (con el IVA de código). */
export function toMarginParams(values: MarginValuesDTO): MarginParams {
  return { vatPct: VAT_PCT, ...values };
}

/** Parámetros → valores editables (para mostrarlos en el panel). */
export function toMarginValues(p: MarginParams): MarginValuesDTO {
  return {
    returnsBufferPct: p.returnsBufferPct,
    shippingCost: p.shippingCost,
    acquisitionCost: p.acquisitionCost ?? 0,
    targetMinPct: p.targetMinPct,
    targetMaxPct: p.targetMaxPct,
    stripePct: p.stripePct,
    stripeFixed: p.stripeFixed,
  };
}

export interface ResolvedMarginSettings {
  params: MarginParams;
  origin: "db" | "env" | "defaults";
  /** No se pudo leer (o validar) la BD: se usan entorno/defaults. */
  degraded: boolean;
  /** Fila vigente de la BD (null si no hay o si falló la lectura). */
  record: MarginSettingsRecord | null;
}

/** Precedencia BD > MARGIN_* > defaults, con caída segura si la BD falla. */
export async function resolveMarginSettings(deps: { store: MarginSettingsStore; env?: Env }): Promise<ResolvedMarginSettings> {
  const env = deps.env ?? process.env;
  const fallback = (degraded: boolean): ResolvedMarginSettings => {
    const { params, applied } = fromEnv(env, DEFAULT_MARGIN_PARAMS);
    return { params, origin: applied ? "env" : "defaults", degraded, record: null };
  };

  let record: MarginSettingsRecord | null;
  try {
    record = await deps.store.latest();
  } catch {
    console.error("[margin] no se pudieron leer los ajustes guardados; se usan entorno/valores por defecto");
    return fallback(true);
  }
  if (!record) return fallback(false);

  const v = parseMarginSettingsValues(record.values, { allowNumericStrings: true });
  if (!v.ok) {
    console.error("[margin] la fila vigente de margin_settings no es válida; se usan entorno/valores por defecto");
    return fallback(true);
  }
  return { params: toMarginParams(v.values), origin: "db", degraded: false, record };
}

export interface DbMarginSource extends MarginSettingsSource {
  resolve(): Promise<ResolvedMarginSettings>;
  /** Tras guardar: la siguiente lectura va a la BD (el siguiente preview ya usa los nuevos). */
  invalidate(): void;
}

/**
 * Fuente con caché corta en memoria (por instancia). Un fallo de BD se cachea
 * menos tiempo para reintentar pronto. En producción con varias instancias, las
 * que no guardaron tardan como mucho `ttlMs` en ver el cambio.
 */
export function createDbMarginSource(opts: {
  store: MarginSettingsStore;
  env?: Env;
  now?: () => number;
  ttlMs?: number;
  degradedTtlMs?: number;
}): DbMarginSource {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? 30_000;
  const degradedTtl = opts.degradedTtlMs ?? 5_000;
  let cached: { at: number; value: ResolvedMarginSettings } | null = null;

  async function resolve(): Promise<ResolvedMarginSettings> {
    const t = now();
    if (cached && t - cached.at < (cached.value.degraded ? degradedTtl : ttl)) return cached.value;
    const value = await resolveMarginSettings({ store: opts.store, env: opts.env });
    cached = { at: t, value };
    return value;
  }

  return {
    resolve,
    get: async () => (await resolve()).params,
    invalidate: () => {
      cached = null;
    },
  };
}

/** Almacén real cargado de forma perezosa (en tests, test/setup.ts lo sustituye por uno en memoria). */
const lazySupabaseStore: MarginSettingsStore = {
  latest: async () => (await import("./settingsStore")).supabaseMarginSettingsStore.latest(),
  history: async (limit) => (await import("./settingsStore")).supabaseMarginSettingsStore.history(limit),
  insert: async (row) => (await import("./settingsStore")).supabaseMarginSettingsStore.insert(row),
};

/**
 * SOLO DESARROLLO: `MARGIN_SETTINGS_MEMORY=1` guarda los ajustes en memoria del
 * proceso (no en la BD) para probar el panel sin escribir en producción (la BD
 * de dev es la de producción). Se ignora por completo con NODE_ENV=production.
 */
export function isMemorySettingsEnabled(env: Env = process.env): boolean {
  return env.MARGIN_SETTINGS_MEMORY === "1" && env.NODE_ENV !== "production";
}

/** Almacén en memoria de solo inserción (mismo contrato que el real). */
export function createMemoryMarginSettingsStore(now: () => number = Date.now): MarginSettingsStore {
  const rows: MarginSettingsRecord[] = [];
  return {
    latest: async () => (rows.length ? rows[rows.length - 1] : null),
    history: async (limit) => rows.slice().reverse().slice(0, limit),
    insert: async (row) => {
      const rec: MarginSettingsRecord = {
        id: rows.length + 1,
        values: { ...row.values },
        createdBy: row.createdBy,
        createdAt: new Date(now()).toISOString(),
        note: row.note,
      };
      rows.push(rec);
      return rec;
    },
  };
}

interface MarginSettingsState {
  store: MarginSettingsStore;
  source: DbMarginSource;
  storage: "db" | "memory";
}

/**
 * UN estado por proceso, en `globalThis`: Next empaqueta cada ruta por separado
 * (en `next dev` cada una tiene su propia copia de los módulos), y una variable
 * de módulo daría una caché por ruta. Así, guardar desde /api/admin/settings
 * invalida la misma caché que lee el preview del modal de importación.
 */
const GLOBAL_KEY = "__bcMarginSettings";

function state(): MarginSettingsState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: MarginSettingsState };
  let s = g[GLOBAL_KEY];
  if (!s) {
    const memory = isMemorySettingsEnabled();
    const store = memory ? createMemoryMarginSettingsStore() : lazySupabaseStore;
    s = { store, source: createDbMarginSource({ store }), storage: memory ? "memory" : "db" };
    g[GLOBAL_KEY] = s;
  }
  return s;
}

/** ÚNICO sitio de cableado de la fuente de ajustes (3.4a: BD con caída a entorno/defaults). */
export function marginSettings(): DbMarginSource {
  return state().source;
}

/** El almacén que usa la fuente activa (para el panel de ajustes). */
export function marginSettingsStore(): MarginSettingsStore {
  return state().store;
}

/** Dónde se guardan los ajustes (el panel avisa si es la memoria de desarrollo). */
export function marginSettingsStorage(): "db" | "memory" {
  return state().storage;
}

import "server-only";
import type { MarginParams } from "./margin";

/**
 * Ajustes de la guarda de margen. ÚNICO punto de cableado: la UI nunca ve estos
 * parámetros (solo el resultado de la guarda), así que cambiar de dónde salen
 * —hoy defaults + env, en la Fase 3.4 una tabla editable por Yosra— no toca la UI.
 *
 * Cómo pasar a 3.4: crear `dbMarginSource: MarginSettingsSource` (lee la tabla
 * de ajustes con service role) y cambiar `marginSettings()` para devolverla.
 */

/**
 * VALORES POR DEFECTO (a validar con Yosra antes de fiarse del semáforo):
 *  · IVA 21 % sobre el PVP (el PVP se guarda con IVA incluido).
 *  · Stripe 1,5 % del PVP + 0,25 € por cobro.
 *  · Colchón de devoluciones 6 % de los ingresos netos (PVP sin IVA). Las
 *    instrucciones del proyecto fijan 5–8 % para decoración; se toma 6 %.
 *  · Envío medio a cargo de B&C 4,50 €/pedido (PROVISIONAL: en 3.4 vendrá por
 *    producto desde BigBuy y este valor será solo el de respaldo).
 *  · Coste de adquisición (ads) 0 € por pedido: el campo existe para poder
 *    sumarlo en 3.4 sin tocar la fórmula; no hay UI todavía.
 *  · Margen neto mínimo 15 % (guarda) y objetivo máximo 35 % (informativo):
 *    "Objetivo neto 15-35 %" del CLAUDE.md.
 */
export const DEFAULT_MARGIN_PARAMS: Readonly<MarginParams> = Object.freeze({
  vatPct: 21,
  shippingCost: 4.5,
  stripePct: 1.5,
  stripeFixed: 0.25,
  returnsBufferPct: 6,
  acquisitionCost: 0,
  targetMinPct: 15,
  targetMaxPct: 35,
});

/** De dónde salen los parámetros. Asíncrono para que la fuente de BD de 3.4 encaje sin cambios. */
export interface MarginSettingsSource {
  get(): Promise<MarginParams>;
}

const PARAM_ENV: Record<keyof MarginParams, string> = {
  vatPct: "MARGIN_VAT_PCT",
  shippingCost: "MARGIN_SHIPPING_EUR",
  stripePct: "MARGIN_STRIPE_PCT",
  stripeFixed: "MARGIN_STRIPE_FIXED_EUR",
  returnsBufferPct: "MARGIN_RETURNS_BUFFER_PCT",
  acquisitionCost: "MARGIN_ACQUISITION_EUR",
  targetMinPct: "MARGIN_TARGET_MIN_PCT",
  targetMaxPct: "MARGIN_TARGET_MAX_PCT",
};

const PERCENT_KEYS: ReadonlySet<keyof MarginParams> = new Set<keyof MarginParams>([
  "vatPct",
  "stripePct",
  "returnsBufferPct",
  "targetMinPct",
  "targetMaxPct",
]);

/**
 * Defaults + overrides opcionales `MARGIN_*` del entorno (permiten probar los
 * valores de Yosra sin tocar código). Un valor inválido (no numérico, negativo,
 * porcentaje > 100) se IGNORA y se usa el por defecto —solo se registra el
 * nombre de la variable, nunca el valor—; el resultado nunca contiene NaN.
 */
export function marginParamsFromEnv(
  env: Record<string, string | undefined> = process.env,
  defaults: Readonly<MarginParams> = DEFAULT_MARGIN_PARAMS
): MarginParams {
  const out: MarginParams = { ...defaults };
  for (const [key, envName] of Object.entries(PARAM_ENV) as [keyof MarginParams, string][]) {
    const raw = env[envName]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    const ok = Number.isFinite(n) && n >= 0 && (!PERCENT_KEYS.has(key) || n <= 100);
    if (!ok) {
      console.warn(`[margin] ${envName} no es válido; se usa el valor por defecto`);
      continue;
    }
    out[key] = n;
  }
  if (out.targetMinPct > out.targetMaxPct) {
    console.warn("[margin] MARGIN_TARGET_MIN_PCT > MARGIN_TARGET_MAX_PCT; se usan los objetivos por defecto");
    out.targetMinPct = defaults.targetMinPct;
    out.targetMaxPct = defaults.targetMaxPct;
  }
  return out;
}

/** Fuente actual (3.3): defaults + env. */
export const defaultMarginSource: MarginSettingsSource = {
  get: async () => marginParamsFromEnv(),
};

/** ÚNICO sitio a cambiar en 3.4 para leer los ajustes de la tabla editable. */
export function marginSettings(): MarginSettingsSource {
  return defaultMarginSource;
}

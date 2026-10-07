import "server-only";

/**
 * Economía unitaria (CLAUDE.md):
 *   precio_venta (IVA incl.) − IVA − coste − envío − comisión Stripe
 *   − colchón de devoluciones = margen neto
 *
 * Todos los parámetros son OBLIGATORIOS y no tienen valores por defecto en
 * código: la guarda de margen es CONFIGURABLE, no hardcodeada. En la Fase 3.1
 * se leen de variables MARGIN_*; en 3.4 pasarán a ser editables por Yosra.
 */

export interface MarginParams {
  /** IVA sobre el PVP, en %. */
  vatPct: number;
  /** Envío medio a cargo de B&C por pedido, en la moneda del precio. */
  shippingCost: number;
  /** Comisión Stripe variable, en % del PVP. */
  stripePct: number;
  /** Comisión Stripe fija por cobro. */
  stripeFixed: number;
  /** Colchón de devoluciones, en % de los ingresos netos (PVP sin IVA). */
  returnsBufferPct: number;
  /** Objetivo de margen neto, en % de ingresos netos. */
  targetMinPct: number;
  targetMaxPct: number;
}

export type MarginTarget = "below" | "within" | "above";

export interface MarginBreakdown {
  /** PVP con IVA. */
  price: number;
  vat: number;
  /** Ingresos netos = PVP − IVA. */
  netRevenue: number;
  cost: number;
  shipping: number;
  stripeFee: number;
  returnsBuffer: number;
  netMargin: number;
  /** Margen neto sobre ingresos netos, en %. */
  netMarginPct: number;
  target: MarginTarget;
}

export type MarginReason =
  | "params_not_configured"
  | "no_suggested_retail"
  | "currency_mismatch"
  | "invalid_input";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeMargin(
  cost: number,
  grossPrice: number,
  p: MarginParams
): MarginBreakdown | null {
  if (![cost, grossPrice].every(Number.isFinite) || cost < 0 || grossPrice <= 0) return null;

  const netRevenue = grossPrice / (1 + p.vatPct / 100);
  const vat = grossPrice - netRevenue;
  const stripeFee = (grossPrice * p.stripePct) / 100 + p.stripeFixed;
  const returnsBuffer = (netRevenue * p.returnsBufferPct) / 100;
  const netMargin = netRevenue - cost - p.shippingCost - stripeFee - returnsBuffer;
  const netMarginPct = (netMargin / netRevenue) * 100;

  const target: MarginTarget =
    netMarginPct < p.targetMinPct ? "below" : netMarginPct > p.targetMaxPct ? "above" : "within";

  return {
    price: round2(grossPrice),
    vat: round2(vat),
    netRevenue: round2(netRevenue),
    cost: round2(cost),
    shipping: round2(p.shippingCost),
    stripeFee: round2(stripeFee),
    returnsBuffer: round2(returnsBuffer),
    netMargin: round2(netMargin),
    netMarginPct: round2(netMarginPct),
    target,
  };
}

const PARAM_ENV: Record<keyof MarginParams, string> = {
  vatPct: "MARGIN_VAT_PCT",
  shippingCost: "MARGIN_SHIPPING_EUR",
  stripePct: "MARGIN_STRIPE_PCT",
  stripeFixed: "MARGIN_STRIPE_FIXED_EUR",
  returnsBufferPct: "MARGIN_RETURNS_BUFFER_PCT",
  targetMinPct: "MARGIN_TARGET_MIN_PCT",
  targetMaxPct: "MARGIN_TARGET_MAX_PCT",
};

/** null si falta o es inválido cualquier parámetro (nunca se inventan valores). */
export function parseMarginParams(
  env: Record<string, string | undefined> = process.env
): MarginParams | null {
  const out: Partial<MarginParams> = {};
  for (const [key, envName] of Object.entries(PARAM_ENV) as [keyof MarginParams, string][]) {
    const raw = env[envName]?.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  const params = out as MarginParams;
  if (params.targetMinPct > params.targetMaxPct) return null;
  return params;
}

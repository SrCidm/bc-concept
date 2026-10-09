import "server-only";
import { computeMargin, type MarginBreakdown, type MarginOverrides, type MarginParams } from "./margin";

/**
 * Guarda de margen. Puro y server-only: el cliente solo muestra su resultado.
 * El mínimo exigido es `targetMinPct` de los parámetros (fuente: `settings.ts`).
 */

export interface MarginCheck {
  breakdown: MarginBreakdown;
  /** Margen neto mínimo exigido, en % de ingresos netos. */
  minPct: number;
  /** Por debajo del mínimo: requiere confirmación explícita para guardar/publicar. */
  belowMin: boolean;
  /** Margen neto ≤ 0 (se vende a pérdida). Implica `belowMin`. */
  loss: boolean;
  /** PVP (IVA incl.) mínimo que alcanza el margen mínimo; null si es inalcanzable. */
  minPrice: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Precio mínimo con IVA que deja el margen mínimo, resuelto en cerrado:
 *   P·[(1 − r − m)/(1 + v) − s] ≥ coste + envío + adquisición + stripeFijo
 * (r colchón, m mínimo, v IVA, s Stripe variable, todos en tanto por uno).
 * Se redondea al alza al céntimo y se comprueba con la fórmula real.
 */
export function minimumPrice(
  cost: number,
  p: MarginParams,
  overrides: MarginOverrides = {}
): number | null {
  if (!Number.isFinite(cost) || cost < 0) return null;
  const shipping = overrides.shippingCost ?? p.shippingCost;
  const fixed = cost + shipping + (p.acquisitionCost ?? 0) + p.stripeFixed;
  const k = (1 - p.returnsBufferPct / 100 - p.targetMinPct / 100) / (1 + p.vatPct / 100) - p.stripePct / 100;
  if (!(k > 0)) return null;

  let price = Math.ceil((fixed / k) * 100) / 100;
  // Salvaguarda ante errores de coma flotante: sube hasta cumplir de verdad.
  for (let i = 0; i < 5; i++) {
    const m = computeMargin(cost, price, p, overrides);
    if (m && m.target !== "below") return price;
    price = cents(price + 0.01);
  }
  return null;
}

export function evaluateMarginGuard(
  cost: number,
  price: number,
  p: MarginParams,
  overrides: MarginOverrides = {}
): MarginCheck | null {
  const breakdown = computeMargin(cost, price, p, overrides);
  if (!breakdown) return null;
  const loss = breakdown.netMargin <= 0;
  return {
    breakdown,
    minPct: p.targetMinPct,
    belowMin: loss || breakdown.target === "below",
    loss,
    minPrice: minimumPrice(cost, p, overrides),
  };
}

/**
 * Coste de referencia de la guarda: el MÁS ALTO entre el producto y sus
 * variantes (peor caso). Una variante cara no puede colar un margen que no
 * cumple. Valores no finitos o negativos se ignoran.
 */
export function worstCaseCost(productCost: number, variantCosts: readonly number[]): number {
  let worst = productCost;
  for (const c of variantCosts) if (Number.isFinite(c) && c >= 0 && c > worst) worst = c;
  return worst;
}

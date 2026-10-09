import "server-only";

/**
 * Economía unitaria (CLAUDE.md):
 *   precio_venta (IVA incl.) − IVA − coste − envío − comisión Stripe
 *   − colchón de devoluciones − coste de adquisición = margen neto
 *
 * Los parámetros NO viven aquí: los entrega una `MarginSettingsSource`
 * (`./settings.ts`: valores por defecto + overrides por env hoy; tabla editable
 * por Yosra en la Fase 3.4). `computeMargin` es una función pura.
 *
 * TODO(Hito 3 · Fase 3.4):
 *   · La guarda de margen será EDITABLE por Yosra desde una tabla de ajustes de
 *     admin (BD, solo service role + requireAdmin): se añade una fuente de BD en
 *     `settings.ts` sin tocar la UI ni esta fórmula.
 *   · El coste de envío NO será un valor fijo: vendrá POR PRODUCTO desde BigBuy.
 *     Ya entra como `overrides.shippingCost` de `computeMargin`; `shippingCost` de
 *     `MarginParams` queda como envío medio de respaldo.
 *   · `acquisitionCost` (ads por pedido) ya está en la fórmula (0 por defecto):
 *     en 3.4 solo hay que darle valor desde los ajustes.
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
  /** Coste de adquisición (ads) por pedido. Opcional: 0 si no se informa. */
  acquisitionCost?: number;
  /** Objetivo de margen neto, en % de ingresos netos. `targetMinPct` es el mínimo de la guarda. */
  targetMinPct: number;
  targetMaxPct: number;
}

/** Datos propios de un producto que mandan sobre el valor global (hoy: envío). */
export interface MarginOverrides {
  shippingCost?: number;
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
  /** Coste de adquisición por pedido (0 si no se usa). */
  acquisition: number;
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
  p: MarginParams,
  overrides: MarginOverrides = {}
): MarginBreakdown | null {
  if (![cost, grossPrice].every(Number.isFinite) || cost < 0 || grossPrice <= 0) return null;

  const shipping = overrides.shippingCost ?? p.shippingCost;
  const acquisition = p.acquisitionCost ?? 0;

  const netRevenue = grossPrice / (1 + p.vatPct / 100);
  const vat = grossPrice - netRevenue;
  const stripeFee = (grossPrice * p.stripePct) / 100 + p.stripeFixed;
  const returnsBuffer = (netRevenue * p.returnsBufferPct) / 100;
  const netMargin = netRevenue - cost - shipping - stripeFee - returnsBuffer - acquisition;
  const netMarginPct = (netMargin / netRevenue) * 100;

  const target: MarginTarget =
    netMarginPct < p.targetMinPct ? "below" : netMarginPct > p.targetMaxPct ? "above" : "within";

  return {
    price: round2(grossPrice),
    vat: round2(vat),
    netRevenue: round2(netRevenue),
    cost: round2(cost),
    shipping: round2(shipping),
    stripeFee: round2(stripeFee),
    returnsBuffer: round2(returnsBuffer),
    acquisition: round2(acquisition),
    netMargin: round2(netMargin),
    netMarginPct: round2(netMarginPct),
    target,
  };
}

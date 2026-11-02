import "server-only";
import { DEFAULT_FX_BUFFER_PCT, usdToEur, usdToEurCost, type FxQuote } from "@/lib/pricing/fx";
import {
  computeMargin,
  type MarginBreakdown,
  type MarginParams,
  type MarginReason,
} from "@/lib/pricing/margin";
import type {
  AdminProductDTO,
  AdminProductPageDTO,
  AdminVariantDTO,
} from "./dto.types";
import type { Money, ProductPage, SupplierProduct, SupplierVariant } from "./types";

/**
 * DTO ADMIN. Incluye coste y margen derivado a propósito: lo consume el panel
 * de una admin verificada (`requireAdmin`, primera línea de cada handler,
 * fail-closed). La regla #1 protege el storefront PÚBLICO/anon: este módulo
 * no debe importarse nunca desde `src/app/[locale]/**` ni `src/lib/catalog/**`
 * (lo vigila un test).
 */

export type { AdminVariantDTO, AdminProductDTO, AdminProductPageDTO } from "./dto.types";

/** Coste en EUR para el margen. Sin tipo de cambio: null (nunca un margen inventado). */
function costInEur(cost: Money, params: MarginParams | null, fx: FxQuote | null): number | null {
  if (cost.currency === "EUR") return cost.amount;
  if (cost.currency !== "USD" || !fx?.ok) return null;
  return usdToEurCost(cost.amount, fx.rate, params?.fxBufferPct ?? DEFAULT_FX_BUFFER_PCT);
}

function deriveMargin(
  cost: Money,
  retail: Money | null,
  params: MarginParams | null,
  fx: FxQuote | null
): { margin: MarginBreakdown | null; marginReason: MarginReason | null } {
  if (!params) return { margin: null, marginReason: "params_not_configured" };
  if (!retail) return { margin: null, marginReason: "no_suggested_retail" };
  if (retail.currency !== cost.currency) return { margin: null, marginReason: "currency_mismatch" };
  if (cost.currency !== "EUR" && cost.currency !== "USD") return { margin: null, marginReason: "currency_mismatch" };

  const eur = costInEur(cost, params, fx);
  if (eur === null) return { margin: null, marginReason: "fx_unavailable" };
  // El PVP de referencia va al tipo oficial: el colchón solo protege el coste.
  const retailEur = retail.currency === "EUR" ? retail.amount : usdToEur(retail.amount, (fx as { rate: number }).rate);
  const margin = computeMargin(eur, retailEur, params);
  return margin
    ? { margin, marginReason: null }
    : { margin: null, marginReason: "invalid_input" };
}

function variantDTO(v: SupplierVariant): AdminVariantDTO {
  return {
    supplierVariantId: v.supplierVariantId,
    sku: v.sku,
    name: v.name,
    cost: v.cost,
    suggestedRetail: v.suggestedRetail,
    stock: v.stock,
    attributes: v.attributes,
    image: v.image,
  };
}

/** `fx`: necesario si el proveedor cobra en otra moneda; sin él no hay margen (fail-closed). */
export function toAdminProductDTO(
  p: SupplierProduct,
  params: MarginParams | null,
  fx: FxQuote | null = null
): AdminProductDTO {
  return {
    supplier: p.supplier,
    supplierProductId: p.supplierProductId,
    sku: p.sku,
    ean: p.ean,
    title: p.title,
    description: p.description,
    images: p.images,
    category: p.category,
    weightKg: p.weightKg,
    cost: p.cost,
    costEur: costInEur(p.cost, params, fx),
    suggestedRetail: p.suggestedRetail,
    ...deriveMargin(p.cost, p.suggestedRetail, params, fx),
    stock: { total: p.stock.total, euTotal: p.stock.euTotal, eu: p.stock.eu },
    delivery: p.delivery,
    variants: p.variants.map(variantDTO),
  };
}

export function toAdminPageDTO(
  page: ProductPage,
  params: MarginParams | null,
  fx: FxQuote | null = null
): AdminProductPageDTO {
  return {
    items: page.items.map((p) => toAdminProductDTO(p, params, fx)),
    page: page.page,
    pageSize: page.pageSize,
    hasMore: page.hasMore,
    fetched: page.fetched,
  };
}

import "server-only";
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

function deriveMargin(
  cost: Money,
  retail: Money | null,
  params: MarginParams | null
): { margin: MarginBreakdown | null; marginReason: MarginReason | null } {
  if (!params) return { margin: null, marginReason: "params_not_configured" };
  if (!retail) return { margin: null, marginReason: "no_suggested_retail" };
  if (retail.currency !== cost.currency) return { margin: null, marginReason: "currency_mismatch" };
  const margin = computeMargin(cost.amount, retail.amount, params);
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

export function toAdminProductDTO(
  p: SupplierProduct,
  params: MarginParams | null
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
    suggestedRetail: p.suggestedRetail,
    ...deriveMargin(p.cost, p.suggestedRetail, params),
    stock: { total: p.stock.total, euTotal: p.stock.euTotal, eu: p.stock.eu },
    delivery: p.delivery,
    variants: p.variants.map(variantDTO),
  };
}

export function toAdminPageDTO(
  page: ProductPage,
  params: MarginParams | null
): AdminProductPageDTO {
  return {
    items: page.items.map((p) => toAdminProductDTO(p, params)),
    page: page.page,
    pageSize: page.pageSize,
    hasMore: page.hasMore,
    fetched: page.fetched,
  };
}

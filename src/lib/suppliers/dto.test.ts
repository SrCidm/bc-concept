import { describe, expect, test } from "bun:test";
import type { MarginParams } from "@/lib/pricing/margin";
import { toAdminPageDTO, toAdminProductDTO } from "./dto";
import type { SupplierProduct } from "./types";

const params: MarginParams = {
  vatPct: 21,
  shippingCost: 4,
  stripePct: 1.5,
  stripeFixed: 0.25,
  returnsBufferPct: 3,
  targetMinPct: 15,
  targetMaxPct: 35,
};

const product: SupplierProduct = {
  supplier: "bigbuy",
  supplierProductId: "1001",
  sku: "S1001",
  ean: null,
  title: "Lámpara",
  description: null,
  images: [],
  category: null,
  weightKg: 1,
  cost: { amount: 18.5, currency: "EUR" },
  suggestedRetail: { amount: 59.9, currency: "EUR" },
  stock: { total: 25, eu: [{ warehouse: "ES", quantity: 25, minHandlingDays: 1, maxHandlingDays: 2 }], euTotal: 25 },
  delivery: { minDays: 1, maxDays: 2 },
  variants: [
    {
      supplierVariantId: "5001",
      sku: "S1001-W",
      name: "Blanco",
      cost: { amount: 18.5, currency: "EUR" },
      suggestedRetail: { amount: 59.9, currency: "EUR" },
      stock: 10,
      attributes: { Color: "Blanco" },
      image: null,
    },
  ],
};

describe("DTO admin (incluye coste y margen, a propósito, tras requireAdmin)", () => {
  test("incluye coste y margen derivado", () => {
    const dto = toAdminProductDTO(product, params);
    expect(dto.cost).toEqual({ amount: 18.5, currency: "EUR" });
    expect(dto.variants[0].cost.amount).toBe(18.5);
    expect(dto.margin).not.toBeNull();
    expect(dto.margin!.netMargin).toBeGreaterThan(0);
    expect(dto.marginReason).toBeNull();
  });

  test("sin parámetros configurados → margin null + motivo", () => {
    const dto = toAdminProductDTO(product, null);
    expect(dto.margin).toBeNull();
    expect(dto.marginReason).toBe("params_not_configured");
    expect(dto.cost.amount).toBe(18.5); // el coste sigue ahí
  });

  test("sin PVP recomendado o con monedas distintas → motivo específico", () => {
    expect(toAdminProductDTO({ ...product, suggestedRetail: null }, params).marginReason).toBe("no_suggested_retail");
    expect(
      toAdminProductDTO({ ...product, cost: { amount: 20, currency: "USD" } }, params).marginReason
    ).toBe("currency_mismatch");
  });

  test("no filtra credenciales ni campos internos del proveedor", () => {
    const json = JSON.stringify(toAdminPageDTO({ items: [product], page: 1, pageSize: 24, hasMore: false, fetched: 1 }, params));
    expect(json).not.toMatch(/apiKey|api_key|authorization|bearer/i);
  });
});

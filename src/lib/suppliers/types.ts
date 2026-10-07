import "server-only";

/**
 * Contrato común de proveedores (regla #5: proveedor-agnóstico).
 * Estos tipos son INTERNOS del servidor: incluyen el coste. Lo que sale por
 * una Route Handler pasa antes por `toAdminProductDTO` y solo tras `requireAdmin`.
 */

export type SupplierId = "bigbuy" | "cj";

export interface Money {
  amount: number;
  /** ISO 4217 (BigBuy = EUR, CJ = USD). */
  currency: string;
}

/** Stock de un almacén. `warehouse` null = la API no informa del almacén. */
export interface WarehouseStock {
  warehouse: string | null;
  quantity: number;
  minHandlingDays: number | null;
  maxHandlingDays: number | null;
}

export interface SupplierVariant {
  supplierVariantId: string;
  sku: string | null;
  name: string;
  /** INTERNO: coste de proveedor. */
  cost: Money;
  suggestedRetail: Money | null;
  stock: number;
  attributes: Record<string, string>;
  image: string | null;
}

export interface SupplierProduct {
  supplier: SupplierId;
  supplierProductId: string;
  sku: string | null;
  ean: string | null;
  title: string;
  description: string | null;
  images: string[];
  category: string | null;
  weightKg: number | null;
  /** INTERNO: coste de proveedor. */
  cost: Money;
  /** PVP recomendado por el proveedor (referencia, no precio de venta). */
  suggestedRetail: Money | null;
  stock: {
    total: number;
    /** Solo almacenes UE (ver warehouses.ts). */
    eu: WarehouseStock[];
    euTotal: number;
  };
  /** Días de manipulación del proveedor (no incluye transporte). */
  delivery: { minDays: number | null; maxDays: number | null };
  variants: SupplierVariant[];
}

export interface ListProductsParams {
  /** Base 1. */
  page?: number;
  /** 1..100. */
  pageSize?: number;
  category?: string;
  query?: string;
  lang?: "es" | "en";
  /** Por defecto true: solo productos con stock en almacén UE. */
  euOnly?: boolean;
  /** Por defecto true: descarta productos sin stock. */
  inStockOnly?: boolean;
}

export interface ProductPage {
  items: SupplierProduct[];
  page: number;
  pageSize: number;
  /** Hay más páginas en el proveedor. */
  hasMore: boolean;
  /** Productos recibidos del proveedor antes de filtrar (UE/stock). */
  fetched: number;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; code: "not_configured" | "unauthorized" | "unreachable" };

export interface SupplierAdapter {
  readonly id: SupplierId;
  /** Resuelve la credencial y comprueba que el proveedor la acepta. */
  auth(): Promise<AuthResult>;
  listProducts(params?: ListProductsParams): Promise<ProductPage>;
  getProduct(
    id: string,
    opts?: Pick<ListProductsParams, "lang">
  ): Promise<SupplierProduct | null>;
}

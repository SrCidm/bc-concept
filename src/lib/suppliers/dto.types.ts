/**
 * Tipos del DTO admin, SIN dependencias de runtime (ni `server-only`): los
 * componentes del panel los importan con `import type` (se borran al compilar,
 * no arrastran código de servidor al bundle). El código que construye el DTO
 * y calcula el coste/margen vive en `dto.ts` (server-only).
 */
import type { MarginBreakdown, MarginReason } from "@/lib/pricing/margin";
import type { Money, SupplierId, WarehouseStock } from "./types";

export interface AdminVariantDTO {
  supplierVariantId: string;
  sku: string | null;
  name: string;
  cost: Money;
  suggestedRetail: Money | null;
  stock: number;
  attributes: Record<string, string>;
  image: string | null;
}

export interface AdminProductDTO {
  supplier: SupplierId;
  supplierProductId: string;
  sku: string | null;
  ean: string | null;
  title: string;
  description: string | null;
  images: string[];
  category: string | null;
  weightKg: number | null;
  cost: Money;
  suggestedRetail: Money | null;
  margin: MarginBreakdown | null;
  /** Por qué no hay margen (null si lo hay). */
  marginReason: MarginReason | null;
  stock: { total: number; euTotal: number; eu: WarehouseStock[] };
  delivery: { minDays: number | null; maxDays: number | null };
  variants: AdminVariantDTO[];
}

export interface AdminProductPageDTO {
  items: AdminProductDTO[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  fetched: number;
}

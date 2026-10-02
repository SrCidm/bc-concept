/**
 * Fila pública de `products_public`. Nunca incluye price_cost,
 * cost_currency ni supplier_product_id (regla no negociable #1).
 */
export interface ProductPublic {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  price_retail: number;
  currency: string;
  images: string[];
  category: string | null;
  inventory: number;
  warehouse: string | null;
  delivery_min_days: number;
  delivery_max_days: number;
  created_at: string;
}

/** Forma cruda tal como la devuelve PostgREST (images es JSONB, numeric puede venir como string). */
export interface ProductPublicRow {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  price_retail: number | string;
  currency: string;
  images: unknown;
  category: string | null;
  inventory: number | null;
  warehouse: string | null;
  delivery_min_days: number | null;
  delivery_max_days: number | null;
  created_at: string;
}

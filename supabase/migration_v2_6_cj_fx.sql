-- ============================================================================
-- B&C: Concept — Migración v2.6: USD→EUR y snapshot de importación (CJ)
-- ----------------------------------------------------------------------------
-- Proyecto destino: ngctedqwmofhdvjowgva (bc_concept). Idempotente.
--
-- CJ cobra en USD y la tienda vende en EUR:
--   coste EUR de la guarda = coste USD × tipo BCE × (1 + colchón de cambio)
--
-- · fx_rates: tipos de cambio diarios (solo inserción, solo backend). Si la
--   consulta falla se usa el último de menos de 7 días; si no, fail-closed.
-- · margin_settings.fx_buffer_pct: colchón de cambio, editable en /admin/ajustes
--   con historial, como los demás ajustes. Los ajustes vigentes quedan en 3 %.
-- · products / product_variants: snapshot para auditar cada producto y recalcular
--   la guarda al publicar. `price_cost` es SIEMPRE EUR; `cost_currency` y
--   `cost_original` guardan el coste original del proveedor.
--
-- Acceso: anon y authenticated no reciben NADA nuevo. `products` y
-- `product_variants` usan grants POR COLUMNA, así que las columnas nuevas nacen
-- inaccesibles para ellos. `products_public` no cambia (lista explícita de
-- columnas). Compatible con el código desplegado: todo es nullable o con DEFAULT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tipos de cambio (solo inserción, solo backend)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fx_rates (
  base       TEXT          NOT NULL CHECK (base ~ '^[A-Z]{3}$'),
  quote      TEXT          NOT NULL CHECK (quote ~ '^[A-Z]{3}$'),
  rate       NUMERIC(12,6) NOT NULL CHECK (rate > 0),
  rate_date  DATE          NOT NULL,
  fetched_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (base, quote, rate_date)
);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;  -- sin políticas a propósito
REVOKE ALL ON public.fx_rates FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fx_rates FROM service_role;
GRANT SELECT, INSERT ON public.fx_rates TO service_role;

-- Un tipo publicado no se reescribe: el snapshot de cada producto apunta a él.
CREATE OR REPLACE FUNCTION public.fx_rates_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'fx_rates es de solo inserción'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fx_rates_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fx_rates_no_update_delete ON public.fx_rates;
CREATE TRIGGER fx_rates_no_update_delete
  BEFORE UPDATE OR DELETE ON public.fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.fx_rates_append_only();

DROP TRIGGER IF EXISTS fx_rates_no_truncate ON public.fx_rates;
CREATE TRIGGER fx_rates_no_truncate
  BEFORE TRUNCATE ON public.fx_rates
  FOR EACH STATEMENT EXECUTE FUNCTION public.fx_rates_append_only();

-- ----------------------------------------------------------------------------
-- 2. Colchón de cambio en los ajustes de margen
--    (ADD COLUMN con DEFAULT no dispara el trigger de solo inserción.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.margin_settings
  ADD COLUMN IF NOT EXISTS fx_buffer_pct NUMERIC(4,2) NOT NULL DEFAULT 3
    CHECK (fx_buffer_pct BETWEEN 0 AND 10);

-- ----------------------------------------------------------------------------
-- 3. Snapshot de importación (INTERNO: sin grant a anon/authenticated)
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_original         NUMERIC(10,2) CHECK (cost_original >= 0),
  ADD COLUMN IF NOT EXISTS fx_rate               NUMERIC(12,6) CHECK (fx_rate > 0),
  ADD COLUMN IF NOT EXISTS fx_rate_date          DATE,
  ADD COLUMN IF NOT EXISTS fx_buffer_pct         NUMERIC(4,2)  CHECK (fx_buffer_pct BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS shipping_estimate     NUMERIC(8,2)  CHECK (shipping_estimate >= 0),
  ADD COLUMN IF NOT EXISTS shipping_method       TEXT,
  ADD COLUMN IF NOT EXISTS supplier_product_type TEXT,
  ADD COLUMN IF NOT EXISTS supplier_seller_id    TEXT,
  ADD COLUMN IF NOT EXISTS supplier_seller_name  TEXT;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS cost_original NUMERIC(10,2) CHECK (cost_original >= 0);

COMMENT ON COLUMN public.products.price_cost IS
  'INTERNO. Coste en EUR que usa la guarda (con colchón de cambio si el original no es EUR). Nunca al cliente.';
COMMENT ON COLUMN public.products.cost_currency IS
  'Moneda del coste original del proveedor (EUR, USD).';
COMMENT ON COLUMN public.products.cost_original IS
  'INTERNO. Coste original del proveedor en cost_currency.';
COMMENT ON COLUMN public.product_variants.price_cost IS
  'INTERNO. Coste en EUR (ver products.price_cost). Nunca al cliente.';

NOTIFY pgrst, 'reload schema';

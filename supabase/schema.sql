-- ============================================================================
-- B&C: Concept — Schema v2  (fuente de verdad del repo)
-- ----------------------------------------------------------------------------
-- Generado desde: migration_v1_to_v2_1.sql (bloques 0.5 en adelante)
-- Cambios principales vs v1:
--   · Proveedor-agnóstico: supplier + supplier_product/variant/order_id
--   · cj_tokens → supplier_credentials (api_key + tokens nullable)
--   · Leak cerrado: GRANT por columna en products/variants → price_cost inaccesible
--   · order_number, retry_count, supplier_error, title_snapshot (idempotencia)
--   · Trigger updated_at automático en products, orders, supplier_credentials
-- Sincronizado con la BD real (ngctedqwmofhdvjowgva) tras las migraciones
-- v2.2 (catálogo + búsqueda), v2.3 (grants de escritura) y v2.4 (funciones).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0.5 Utilidad: trigger updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1. PRODUCTOS (proveedor-agnóstico)
-- ----------------------------------------------------------------------------
CREATE TABLE products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier            TEXT NOT NULL CHECK (supplier IN ('bigbuy','cj')),
  supplier_product_id TEXT NOT NULL,
  slug                TEXT UNIQUE,
  title               TEXT NOT NULL,
  description         TEXT,
  price_cost          NUMERIC(10,2) NOT NULL,         -- INTERNO. Nunca al cliente.
  cost_currency       TEXT NOT NULL DEFAULT 'EUR',    -- BigBuy=EUR, CJ=USD
  price_retail        NUMERIC(10,2) NOT NULL,         -- público, IVA incluido (EUR)
  currency            TEXT NOT NULL DEFAULT 'EUR',
  images              JSONB DEFAULT '[]',
  inventory           INT DEFAULT 0,
  category            TEXT,
  weight              NUMERIC,
  warehouse           TEXT,                           -- 'ES','DE','PL'...
  delivery_min_days   INT DEFAULT 3,
  delivery_max_days   INT DEFAULT 7,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active','draft','archived')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier, supplier_product_id)
);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. VARIANTES
-- ----------------------------------------------------------------------------
CREATE TABLE product_variants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier            TEXT NOT NULL CHECK (supplier IN ('bigbuy','cj')),
  supplier_variant_id TEXT NOT NULL,
  sku                 TEXT NOT NULL,
  name                TEXT NOT NULL,
  price_cost          NUMERIC(10,2) NOT NULL,         -- INTERNO
  price_retail        NUMERIC(10,2) NOT NULL,
  inventory           INT DEFAULT 0,
  attributes          JSONB DEFAULT '{}',
  image               TEXT,
  UNIQUE (supplier, supplier_variant_id)
);

-- ----------------------------------------------------------------------------
-- 3. ÓRDENES (idempotencia + retry)
--    NOTA Fase 1: se asume 1 proveedor por pedido. Si una cesta mezcla
--    BigBuy + CJ, divídelo en dispatches (tabla supplier_orders en el futuro).
-- ----------------------------------------------------------------------------
CREATE SEQUENCE order_number_seq START 1000;

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      TEXT UNIQUE NOT NULL DEFAULT ('BC-' || lpad(nextval('order_number_seq')::text, 6, '0')),
  stripe_session_id TEXT UNIQUE,                       -- idempotencia webhook Stripe
  supplier          TEXT CHECK (supplier IN ('bigbuy','cj')),
  supplier_order_id TEXT UNIQUE,
  customer_email    TEXT NOT NULL,
  customer_name     TEXT,
  shipping_address  JSONB NOT NULL,
  subtotal          NUMERIC(10,2),                     -- sin IVA
  vat_amount        NUMERIC(10,2),                     -- IVA repercutido
  total_amount      NUMERIC(10,2) NOT NULL,            -- IVA incl.
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','processing','shipped','delivered','cancelled','error_supplier')),
  retry_count       INT NOT NULL DEFAULT 0,            -- máx 3 → error_supplier
  supplier_error    TEXT,                              -- solo admin
  tracking_number   TEXT,
  tracking_url      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. ÍTEMS (snapshot inmutable para recrear el pedido en un retry)
-- ----------------------------------------------------------------------------
CREATE TABLE order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id          UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  supplier            TEXT NOT NULL,
  supplier_variant_id TEXT NOT NULL,                   -- sin esto, un retry es imposible
  title_snapshot      TEXT NOT NULL,
  quantity            INT NOT NULL CHECK (quantity > 0),
  unit_price          NUMERIC(10,2) NOT NULL,          -- venta en el momento
  unit_cost           NUMERIC(10,2) NOT NULL           -- coste en el momento (margen real)
);

-- ----------------------------------------------------------------------------
-- 5. CREDENCIALES DE PROVEEDOR (generaliza cj_tokens)
-- ----------------------------------------------------------------------------
CREATE TABLE supplier_credentials (
  supplier             TEXT PRIMARY KEY CHECK (supplier IN ('bigbuy','cj')),
  api_key              TEXT,
  access_token         TEXT,
  refresh_token        TEXT,
  access_token_expiry  TIMESTAMPTZ,
  refresh_token_expiry TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_credentials_updated BEFORE UPDATE ON supplier_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. SEGURIDAD — cierre del leak de price_cost (lo crítico)
-- ============================================================================
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_credentials ENABLE ROW LEVEL SECURITY;

-- 6.1 PRODUCTS: público ve solo filas activas y SOLO columnas seguras.
REVOKE SELECT ON products FROM anon, authenticated;
GRANT  SELECT (id, supplier, slug, title, description, price_retail, currency,
               images, inventory, category, weight, warehouse,
               delivery_min_days, delivery_max_days, status, created_at)
       ON products TO anon, authenticated;
CREATE POLICY "public reads active products"
  ON products FOR SELECT TO anon, authenticated
  USING (status = 'active');
-- price_cost / cost_currency / supplier_product_id NO están en el GRANT → inaccesibles.
-- Los default privileges de Supabase dan a anon/authenticated escritura total en
-- tablas nuevas; RLS frena INSERT/UPDATE/DELETE pero NO TRUNCATE → se retira (v2.3).
-- El REVOKE a nivel tabla retira también los privilegios por columna.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON products, product_variants FROM anon, authenticated;

-- 6.2 VARIANTS: oculta price_cost y supplier_variant_id.
REVOKE SELECT ON product_variants FROM anon, authenticated;
GRANT  SELECT (id, product_id, sku, name, price_retail, inventory, attributes, image)
       ON product_variants TO anon, authenticated;
CREATE POLICY "public reads variants"
  ON product_variants FOR SELECT TO anon, authenticated
  USING (true);

-- 6.3 orders / order_items / supplier_credentials: solo backend (service role).
REVOKE ALL ON orders, order_items, supplier_credentials FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Índices
-- ----------------------------------------------------------------------------
CREATE INDEX idx_products_status   ON products (status);
CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_variants_product  ON product_variants (product_id);
CREATE INDEX idx_orders_status     ON orders (status);
CREATE INDEX idx_order_items_order ON order_items (order_id);

-- ============================================================================
-- 7.5 CATÁLOGO PÚBLICO Y BÚSQUEDA (migration_v2_2_catalog.sql)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent inmutable (indexable) + índice trigram sobre el título normalizado
CREATE OR REPLACE FUNCTION public.bc_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = extensions, public
AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

CREATE INDEX idx_products_title_trgm
  ON products USING gin (public.bc_unaccent(lower(title)) extensions.gin_trgm_ops);

-- Vista pública: SOLO columnas seguras y SOLO productos activos.
-- (sin price_cost, cost_currency, supplier, supplier_product_id, weight, status)
CREATE VIEW products_public
WITH (security_invoker = true) AS
SELECT id, slug, title, description, price_retail, currency, images, category,
       inventory, warehouse, delivery_min_days, delivery_max_days, created_at
FROM products
WHERE status = 'active';

REVOKE ALL ON products_public FROM anon, authenticated;
GRANT  SELECT ON products_public TO anon, authenticated;

-- Búsqueda: subcadena sin tildes O similitud trigram (erratas). SECURITY INVOKER.
CREATE FUNCTION public.search_products_public(q text, max_rows int DEFAULT 24)
RETURNS SETOF public.products_public
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = extensions, public
AS $$
  WITH n AS (
    SELECT public.bc_unaccent(lower(btrim(q))) AS term,
           replace(replace(public.bc_unaccent(lower(btrim(q))), '%', ''), '_', '') AS lit
  )
  SELECT p.*
  FROM public.products_public p, n
  WHERE length(n.lit) > 0
    AND (
      public.bc_unaccent(lower(p.title)) ILIKE '%' || n.lit || '%'
      OR public.bc_unaccent(lower(coalesce(p.category, ''))) ILIKE '%' || n.lit || '%'
      OR extensions.word_similarity(n.term, public.bc_unaccent(lower(p.title))) > 0.4
    )
  ORDER BY extensions.word_similarity(n.term, public.bc_unaccent(lower(p.title))) DESC,
           p.created_at DESC
  LIMIT least(greatest(max_rows, 1), 48)
$$;

REVOKE ALL ON FUNCTION public.search_products_public(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products_public(text, int) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7.6 Endurecimiento de funciones (migration_v2_4_function_hardening.sql)
--     · set_updated_at con search_path vacío.
--     · rls_auto_enable() (helper de Supabase para el event trigger ensure_rls)
--       no debe ser invocable por la API: se revoca de PUBLIC/anon/authenticated.
--       Solo existe en proyectos con "auto-enable RLS"; se omite si no está.
-- ----------------------------------------------------------------------------
ALTER FUNCTION set_updated_at() SET search_path = '';

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 8. Recargar la cache de PostgREST para que la API vea el nuevo esquema
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

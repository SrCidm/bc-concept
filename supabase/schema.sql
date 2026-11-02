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
-- v2.2 (catálogo + búsqueda), v2.3 (grants de escritura), v2.4 (funciones)
-- v2.5 (margin_settings: ajustes de margen de solo inserción) y v2.6 (fx_rates,
-- colchón de cambio y snapshot de importación).
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
-- 7.7 AJUSTES DE MARGEN (migration_v2_5_margin_settings.sql)
--     Solo inserción: cada guardado es una fila nueva; la vigente es la más
--     reciente. Solo service_role (SELECT + INSERT); anon/authenticated sin
--     acceso; RLS sin políticas; trigger que impide UPDATE/DELETE/TRUNCATE.
--     El IVA no está aquí: es fijo en código (21 %).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.margin_settings (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  returns_buffer_pct    NUMERIC(5,2) NOT NULL CHECK (returns_buffer_pct BETWEEN 0 AND 30),
  shipping_cost_default NUMERIC(8,2) NOT NULL CHECK (shipping_cost_default BETWEEN 0 AND 100),
  acquisition_cost      NUMERIC(8,2) NOT NULL CHECK (acquisition_cost BETWEEN 0 AND 200),
  min_margin_pct        NUMERIC(5,2) NOT NULL CHECK (min_margin_pct BETWEEN 0 AND 80),
  target_max_pct        NUMERIC(5,2) NOT NULL CHECK (target_max_pct <= 100),
  stripe_pct            NUMERIC(5,2) NOT NULL CHECK (stripe_pct BETWEEN 0 AND 10),
  stripe_fixed          NUMERIC(6,2) NOT NULL CHECK (stripe_fixed BETWEEN 0 AND 2),
  created_by            TEXT        NOT NULL CHECK (length(created_by) BETWEEN 3 AND 320),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note                  TEXT CHECK (note IS NULL OR length(note) <= 280),
  CONSTRAINT margin_settings_target_ge_min CHECK (target_max_pct >= min_margin_pct)
);

CREATE INDEX IF NOT EXISTS margin_settings_created_at_idx
  ON public.margin_settings (created_at DESC, id DESC);

-- Acceso: solo backend, solo lectura + inserción.
ALTER TABLE public.margin_settings ENABLE ROW LEVEL SECURITY;  -- sin políticas a propósito
REVOKE ALL ON public.margin_settings FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.margin_settings FROM service_role;
GRANT SELECT, INSERT ON public.margin_settings TO service_role;

-- Solo inserción también a nivel de BD (aunque alguien tenga privilegios).
CREATE OR REPLACE FUNCTION public.margin_settings_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'margin_settings es de solo inserción'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.margin_settings_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS margin_settings_no_update_delete ON public.margin_settings;
CREATE TRIGGER margin_settings_no_update_delete
  BEFORE UPDATE OR DELETE ON public.margin_settings
  FOR EACH ROW EXECUTE FUNCTION public.margin_settings_append_only();

DROP TRIGGER IF EXISTS margin_settings_no_truncate ON public.margin_settings;
CREATE TRIGGER margin_settings_no_truncate
  BEFORE TRUNCATE ON public.margin_settings
  FOR EACH STATEMENT EXECUTE FUNCTION public.margin_settings_append_only();

-- ----------------------------------------------------------------------------
-- 8. Recargar la cache de PostgREST para que la API vea el nuevo esquema
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 7.8 USD→EUR Y SNAPSHOT DE IMPORTACIÓN (migration_v2_6_cj_fx.sql)
--     price_cost es SIEMPRE EUR; cost_original y cost_currency guardan el coste
--     original. Las columnas nuevas no tienen grant a anon/authenticated y
--     products_public no cambia.
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

-- ----------------------------------------------------------------------------
-- 7.9 REVISAR Y PUBLICAR (migration_v2_7_publish.sql)
--     Textos EN y slug EN públicos; texto original del proveedor, muestra y
--     publicación internos. Invariante de activo, historial de solo inserción
--     (product_events) y funciones admin_* (cambio + evento en una transacción,
--     solo service_role). anon/authenticated pierden supplier y weight.
-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 1. Columnas de products
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS title_en               TEXT,
  ADD COLUMN IF NOT EXISTS description_en         TEXT,
  ADD COLUMN IF NOT EXISTS slug_en                TEXT,
  ADD COLUMN IF NOT EXISTS supplier_title         TEXT,
  ADD COLUMN IF NOT EXISTS supplier_description   TEXT,
  ADD COLUMN IF NOT EXISTS shipping_cost_original NUMERIC(8,2) CHECK (shipping_cost_original >= 0),
  ADD COLUMN IF NOT EXISTS sample_verified_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sample_verified_by     TEXT,
  ADD COLUMN IF NOT EXISTS sample_verified_notes  TEXT,
  ADD COLUMN IF NOT EXISTS published_at           TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_en_key ON public.products (slug_en);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_slug_format;
ALTER TABLE public.products ADD CONSTRAINT products_slug_format CHECK (
  (slug IS NULL OR (length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
  AND (slug_en IS NULL OR (length(slug_en) <= 80 AND slug_en ~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_valid;
ALTER TABLE public.products ADD CONSTRAINT products_category_valid CHECK (
  category IS NULL OR category IN ('lighting', 'textiles', 'decor')
);

-- Muestra: los tres campos a la vez o ninguno, con una nota que diga qué se comprobó.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sample_complete;
ALTER TABLE public.products ADD CONSTRAINT products_sample_complete CHECK (
  (sample_verified_at IS NULL AND sample_verified_by IS NULL AND sample_verified_notes IS NULL)
  OR (sample_verified_at IS NOT NULL
      AND length(sample_verified_by) BETWEEN 3 AND 320
      AND length(btrim(sample_verified_notes)) BETWEEN 10 AND 1000)
);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_active_ready;
ALTER TABLE public.products ADD CONSTRAINT products_active_ready CHECK (
  status <> 'active' OR (
    category IS NOT NULL
    AND slug IS NOT NULL
    AND slug_en IS NOT NULL
    AND btrim(title) <> ''
    AND btrim(coalesce(description, '')) <> ''
    AND sample_verified_at IS NOT NULL
  )
);

COMMENT ON COLUMN public.products.title IS 'Título ES público. Al importar, el del proveedor como punto de partida.';
COMMENT ON COLUMN public.products.supplier_title IS 'INTERNO. Título original del proveedor: publicar exige cambiarlo.';
COMMENT ON COLUMN public.products.supplier_description IS 'INTERNO. Descripción original del proveedor (texto plano).';
COMMENT ON COLUMN public.products.shipping_cost_original IS 'INTERNO. Flete en cost_currency (para recalcular con el tipo del día).';
COMMENT ON COLUMN public.products.slug IS 'Slug ES. Se fija al publicar por primera vez y no cambia (URLs estables).';
COMMENT ON COLUMN public.products.slug_en IS 'Slug EN. Se fija al publicar por primera vez y no cambia (URLs estables).';

-- ----------------------------------------------------------------------------
-- 2. Acceso público por columna
-- ----------------------------------------------------------------------------
REVOKE SELECT (supplier, weight) ON public.products FROM anon, authenticated;
GRANT  SELECT (title_en, description_en, slug_en) ON public.products TO anon, authenticated;

-- Las 13 columnas de antes, en el mismo orden, y las 3 nuevas al final.
CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = true) AS
SELECT id, slug, title, description, price_retail, currency, images, category,
       inventory, warehouse, delivery_min_days, delivery_max_days, created_at,
       title_en, description_en, slug_en
FROM public.products
WHERE status = 'active';

REVOKE ALL ON public.products_public FROM anon, authenticated;
GRANT  SELECT ON public.products_public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Historial (solo inserción, solo backend)
--    Sin FK a products: descartar un borrador lo borra y su historial queda.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id          UUID          NOT NULL,
  supplier            TEXT          NOT NULL CHECK (supplier IN ('bigbuy', 'cj')),
  supplier_product_id TEXT          NOT NULL,
  action              TEXT          NOT NULL CHECK (action IN ('import', 'edit', 'sample_verified', 'sample_unverified', 'publish', 'unpublish', 'discard')),
  actor               TEXT          NOT NULL CHECK (length(actor) BETWEEN 3 AND 320),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status_before       TEXT,
  status_after        TEXT,
  price_before        NUMERIC(10,2),
  price_after         NUMERIC(10,2),
  details             JSONB         NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS product_events_product_idx
  ON public.product_events (product_id, created_at DESC, id DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;  -- sin políticas a propósito
REVOKE ALL ON public.product_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.product_events FROM service_role;
GRANT SELECT, INSERT ON public.product_events TO service_role;

CREATE OR REPLACE FUNCTION public.product_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'product_events es de solo inserción'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.product_events_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_events_no_update_delete ON public.product_events;
CREATE TRIGGER product_events_no_update_delete
  BEFORE UPDATE OR DELETE ON public.product_events
  FOR EACH ROW EXECUTE FUNCTION public.product_events_append_only();

DROP TRIGGER IF EXISTS product_events_no_truncate ON public.product_events;
CREATE TRIGGER product_events_no_truncate
  BEFORE TRUNCATE ON public.product_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.product_events_append_only();

-- ----------------------------------------------------------------------------
-- 4. Acciones del panel: cambio + evento en una transacción.
--    El servidor valida antes; aquí se bloquea la fila y se comprueba el estado.
--    Errores: 'bc:not_found', 'bc:not_draft', 'bc:not_active', 'bc:stale'.
-- ----------------------------------------------------------------------------

-- Textos, categoría y PVP de un borrador (el PVP también en sus variantes).
CREATE OR REPLACE FUNCTION public.admin_save_product(
  p_id UUID, p_actor TEXT,
  p_title TEXT, p_description TEXT, p_title_en TEXT, p_description_en TEXT,
  p_category TEXT, p_price NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  p public.products%ROWTYPE;
  changed TEXT[] := '{}';
BEGIN
  SELECT * INTO p FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bc:not_found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'bc:not_draft'; END IF;

  IF p.title IS DISTINCT FROM p_title THEN changed := changed || 'title'::TEXT; END IF;
  IF p.description IS DISTINCT FROM p_description THEN changed := changed || 'description'::TEXT; END IF;
  IF p.title_en IS DISTINCT FROM p_title_en THEN changed := changed || 'title_en'::TEXT; END IF;
  IF p.description_en IS DISTINCT FROM p_description_en THEN changed := changed || 'description_en'::TEXT; END IF;
  IF p.category IS DISTINCT FROM p_category THEN changed := changed || 'category'::TEXT; END IF;
  IF p.price_retail IS DISTINCT FROM p_price THEN changed := changed || 'price_retail'::TEXT; END IF;
  IF cardinality(changed) = 0 THEN RETURN; END IF;

  UPDATE public.products
     SET title = p_title, description = p_description,
         title_en = p_title_en, description_en = p_description_en,
         category = p_category, price_retail = p_price
   WHERE id = p_id;
  IF p.price_retail IS DISTINCT FROM p_price THEN
    UPDATE public.product_variants SET price_retail = p_price WHERE product_id = p_id;
  END IF;

  INSERT INTO public.product_events
    (product_id, supplier, supplier_product_id, action, actor, status_before, status_after, price_before, price_after, details)
  VALUES
    (p.id, p.supplier, p.supplier_product_id, 'edit', p_actor, p.status, p.status, p.price_retail, p_price,
     jsonb_build_object('fields', to_jsonb(changed)));
END;
$$;

-- Verificado con muestra (marca o desmarca) en un borrador.
CREATE OR REPLACE FUNCTION public.admin_set_sample(p_id UUID, p_actor TEXT, p_verified BOOLEAN, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bc:not_found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'bc:not_draft'; END IF;

  IF p_verified THEN
    UPDATE public.products
       SET sample_verified_at = NOW(), sample_verified_by = p_actor, sample_verified_notes = btrim(p_notes)
     WHERE id = p_id;
  ELSE
    UPDATE public.products
       SET sample_verified_at = NULL, sample_verified_by = NULL, sample_verified_notes = NULL
     WHERE id = p_id;
  END IF;

  INSERT INTO public.product_events
    (product_id, supplier, supplier_product_id, action, actor, status_before, status_after, price_before, price_after, details)
  VALUES
    (p.id, p.supplier, p.supplier_product_id,
     CASE WHEN p_verified THEN 'sample_verified' ELSE 'sample_unverified' END,
     p_actor, p.status, p.status, p.price_retail, p.price_retail,
     CASE WHEN p_verified THEN jsonb_build_object('notes', btrim(p_notes)) ELSE '{}'::JSONB END);
END;
$$;

-- Publicar con el snapshot fresco que calculó el servidor. Los slugs solo se
-- fijan la primera vez. Si el PVP cambió desde la comprobación: 'bc:stale'.
CREATE OR REPLACE FUNCTION public.admin_publish_product(
  p_id UUID, p_actor TEXT, p_expected_price NUMERIC,
  p_slug TEXT, p_slug_en TEXT, p_snapshot JSONB, p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  p public.products%ROWTYPE;
  variants JSONB := coalesce(p_snapshot -> 'variants', '[]'::JSONB);
  out_slug TEXT;
  out_slug_en TEXT;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bc:not_found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'bc:not_draft'; END IF;
  IF p.price_retail IS DISTINCT FROM p_expected_price THEN RAISE EXCEPTION 'bc:stale'; END IF;

  UPDATE public.products
     SET status                 = 'active',
         published_at           = NOW(),
         slug                   = coalesce(p.slug, p_slug),
         slug_en                = coalesce(p.slug_en, p_slug_en),
         price_cost             = (p_snapshot ->> 'price_cost')::NUMERIC,
         cost_original          = (p_snapshot ->> 'cost_original')::NUMERIC,
         fx_rate                = (p_snapshot ->> 'fx_rate')::NUMERIC,
         fx_rate_date           = (p_snapshot ->> 'fx_rate_date')::DATE,
         fx_buffer_pct          = (p_snapshot ->> 'fx_buffer_pct')::NUMERIC,
         shipping_estimate      = (p_snapshot ->> 'shipping_estimate')::NUMERIC,
         shipping_cost_original = (p_snapshot ->> 'shipping_cost_original')::NUMERIC,
         shipping_method        = p_snapshot ->> 'shipping_method',
         inventory              = (p_snapshot ->> 'inventory')::INT,
         warehouse              = p_snapshot ->> 'warehouse',
         delivery_min_days      = (p_snapshot ->> 'delivery_min_days')::INT,
         delivery_max_days      = (p_snapshot ->> 'delivery_max_days')::INT
   WHERE id = p_id
   RETURNING slug, slug_en INTO out_slug, out_slug_en;

  UPDATE public.product_variants v
     SET price_cost    = (x ->> 'price_cost')::NUMERIC,
         cost_original = (x ->> 'cost_original')::NUMERIC,
         inventory     = (x ->> 'inventory')::INT
    FROM jsonb_array_elements(variants) AS x
   WHERE v.product_id = p_id AND v.supplier_variant_id = x ->> 'supplier_variant_id';
  -- Variantes que el proveedor ya no devuelve: sin stock.
  UPDATE public.product_variants v
     SET inventory = 0
   WHERE v.product_id = p_id
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(variants) AS x WHERE x ->> 'supplier_variant_id' = v.supplier_variant_id);

  INSERT INTO public.product_events
    (product_id, supplier, supplier_product_id, action, actor, status_before, status_after, price_before, price_after, details)
  VALUES
    (p.id, p.supplier, p.supplier_product_id, 'publish', p_actor, p.status, 'active', p.price_retail, p.price_retail,
     coalesce(p_details, '{}'::JSONB)
       || jsonb_build_object('slug', out_slug, 'slug_en', out_slug_en,
                             'cost_before', p.price_cost, 'cost_after', (p_snapshot ->> 'price_cost')::NUMERIC));

  RETURN jsonb_build_object('slug', out_slug, 'slug_en', out_slug_en);
END;
$$;

-- Despublicar: vuelve a borrador; los slugs se conservan.
CREATE OR REPLACE FUNCTION public.admin_unpublish_product(p_id UUID, p_actor TEXT)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bc:not_found'; END IF;
  IF p.status <> 'active' THEN RAISE EXCEPTION 'bc:not_active'; END IF;

  UPDATE public.products SET status = 'draft' WHERE id = p_id;

  INSERT INTO public.product_events
    (product_id, supplier, supplier_product_id, action, actor, status_before, status_after, price_before, price_after)
  VALUES
    (p.id, p.supplier, p.supplier_product_id, 'unpublish', p_actor, p.status, 'draft', p.price_retail, p.price_retail);
END;
$$;

-- Descartar: borra un BORRADOR (y sus variantes). Nunca un activo.
CREATE OR REPLACE FUNCTION public.admin_discard_product(p_id UUID, p_actor TEXT)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bc:not_found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'bc:not_draft'; END IF;

  INSERT INTO public.product_events
    (product_id, supplier, supplier_product_id, action, actor, status_before, status_after, price_before, price_after, details)
  VALUES
    (p.id, p.supplier, p.supplier_product_id, 'discard', p_actor, p.status, NULL, p.price_retail, NULL,
     jsonb_build_object('title', p.title));

  DELETE FROM public.products WHERE id = p_id AND status = 'draft';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_product(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_sample(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_publish_product(UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unpublish_product(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_discard_product(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_save_product(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_set_sample(UUID, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_publish_product(UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB, JSONB) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_unpublish_product(UUID, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_discard_product(UUID, TEXT) TO service_role;

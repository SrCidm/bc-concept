-- ============================================================================
-- B&C: Concept — Migración v2.7: revisar y publicar productos (Hito 3.4b)
-- ----------------------------------------------------------------------------
-- Proyecto destino: ngctedqwmofhdvjowgva (bc_concept). Idempotente.
--
-- · products: textos EN y slug EN (públicos), texto original del proveedor,
--   flete en moneda original, "verificado con muestra" y fecha de publicación
--   (internos). `title`/`description` son los textos ES públicos.
-- · Invariante de activo: un producto `active` tiene categoría, slugs, título y
--   descripción ES y muestra verificada. Es la segunda barrera: la primera es el
--   servidor, que además vuelve a pedir el producto al proveedor.
-- · product_events: historial de solo inserción (mismo blindaje que margin_settings).
-- · Funciones admin_*: cada cambio y su evento en la misma transacción. Solo
--   service_role. Errores con códigos fijos `bc:<código>`.
--
-- Acceso público: anon/authenticated reciben SOLO title_en, description_en y
-- slug_en (también en products_public) y PIERDEN supplier y weight, que no usa la
-- tienda. Ninguna otra columna nueva es pública.
-- ============================================================================

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

NOTIFY pgrst, 'reload schema';

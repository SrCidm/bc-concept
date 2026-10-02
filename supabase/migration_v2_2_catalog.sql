-- ============================================================================
-- B&C: Concept — Migración v2.2: catálogo público + búsqueda tolerante
-- ----------------------------------------------------------------------------
-- Idempotente. NO aplicada aún: ejecutar en el proyecto B&C (no en Totsy).
-- Añade: extensiones pg_trgm/unaccent, vista products_public (sin price_cost),
-- función de búsqueda search_products_public y su índice trigram.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. Vista pública: solo columnas seguras de productos activos.
--    security_invoker → respeta grants de columna y RLS del rol que consulta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW products_public
WITH (security_invoker = true) AS
SELECT id, slug, title, description, price_retail, currency, images, category,
       inventory, warehouse, delivery_min_days, delivery_max_days, created_at
FROM products
WHERE status = 'active';

REVOKE ALL ON products_public FROM anon, authenticated;
GRANT  SELECT ON products_public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. unaccent inmutable (necesario para indexar expresiones)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = extensions, public
AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON products USING gin (public.bc_unaccent(lower(title)) extensions.gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. Búsqueda: subcadena (sin tildes) O similitud trigram (erratas).
--    SECURITY INVOKER → mismas restricciones que la vista.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_products_public(q text, max_rows int DEFAULT 24)
RETURNS SETOF products_public
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = extensions, public
AS $$
  WITH n AS (SELECT public.bc_unaccent(lower(btrim(q))) AS term)
  SELECT p.*
  FROM products_public p, n
  WHERE length(n.term) > 0
    AND (
      public.bc_unaccent(lower(p.title)) ILIKE '%' || replace(replace(n.term, '%', ''), '_', '') || '%'
      OR public.bc_unaccent(lower(coalesce(p.category, ''))) ILIKE '%' || replace(replace(n.term, '%', ''), '_', '') || '%'
      OR extensions.word_similarity(n.term, public.bc_unaccent(lower(p.title))) > 0.4
    )
  ORDER BY extensions.word_similarity(n.term, public.bc_unaccent(lower(p.title))) DESC,
           p.created_at DESC
  LIMIT least(greatest(max_rows, 1), 48)
$$;

REVOKE ALL ON FUNCTION public.search_products_public(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products_public(text, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

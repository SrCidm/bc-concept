-- ============================================================================
-- B&C: Concept — Migración v2.2: catálogo público + búsqueda tolerante
-- ----------------------------------------------------------------------------
-- Proyecto destino: ngctedqwmofhdvjowgva (bc_concept). NO aplicada todavía.
-- Idempotente: se puede re-ejecutar sin error ni cambios.
--
-- Estado verificado en la BD antes de escribir esto (solo lectura):
--   · pg_trgm 1.6 y unaccent 1.1 DISPONIBLES pero NO instaladas.
--   · products_public YA EXISTE (security_invoker, owner postgres) y expone
--     supplier, weight y status, sin filtro WHERE (depende solo de RLS).
--   · No existe función de búsqueda ni índice trigram.
--   · products tiene 0 filas.
--   · anon/authenticated tienen INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES
--     sobre products y products_public (default privileges de Supabase).
--     price_cost NO tiene SELECT (bien), pero TRUNCATE salta RLS → se cierra en
--     migration_v2_3_harden_table_grants.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensiones (schema `extensions`, convención de Supabase)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 2. unaccent inmutable (necesario para indexar la expresión) + índice trigram
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = extensions, public
AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON public.products USING gin (public.bc_unaccent(lower(title)) extensions.gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. Vista pública: SOLO columnas seguras y SOLO productos activos.
--    La vista actual expone además supplier/weight/status → se recrea más
--    estrecha (CREATE OR REPLACE no puede quitar columnas). Seguro porque
--    products tiene 0 filas y nada del front depende de esas columnas.
--    Orden: primero la función que depende de la vista, luego la vista.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_products_public(text, int);
DROP VIEW     IF EXISTS public.products_public;

CREATE VIEW public.products_public
WITH (security_invoker = true) AS
SELECT id, slug, title, description, price_retail, currency, images, category,
       inventory, warehouse, delivery_min_days, delivery_max_days, created_at
FROM public.products
WHERE status = 'active';

-- DROP/CREATE reinicia los grants a los default privileges (todo para anon):
REVOKE ALL ON public.products_public FROM anon, authenticated;
GRANT  SELECT ON public.products_public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Búsqueda: subcadena (sin tildes) O similitud trigram (erratas).
--    SECURITY INVOKER → mismas restricciones que la vista.
-- ----------------------------------------------------------------------------
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

NOTIFY pgrst, 'reload schema';

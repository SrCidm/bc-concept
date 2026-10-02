-- ============================================================================
-- B&C: Concept — Migración v2.3: endurecimiento de grants de escritura
-- ----------------------------------------------------------------------------
-- Proyecto destino: ngctedqwmofhdvjowgva (bc_concept). Idempotente.
--
-- Problema: los default privileges de Supabase concedieron a anon/authenticated
-- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER sobre products y
-- product_variants (schema.sql solo hacía REVOKE SELECT). RLS frena
-- INSERT/UPDATE/DELETE, pero TRUNCATE NO pasa por RLS → con la anon key
-- (pública) se podría vaciar el catálogo.
--
-- Solución: anon/authenticated solo conservan SELECT por columna (ya
-- concedido en schema.sql). El backend usa service_role: no se ve afectado.
-- REVOKE a nivel de tabla retira también los privilegios por columna
-- (INSERT/UPDATE/REFERENCES sobre price_cost incluidos).
--
-- Verificado antes: orders, order_items y supplier_credentials no tienen
-- ningún grant para anon/authenticated (tabla ni columna). No se tocan.
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.products, public.product_variants
  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

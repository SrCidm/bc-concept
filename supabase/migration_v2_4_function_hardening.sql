-- ============================================================================
-- B&C: Concept — Migración v2.4: endurecimiento de funciones (advisors)
-- ----------------------------------------------------------------------------
-- Proyecto destino: ngctedqwmofhdvjowgva (bc_concept). Idempotente.
--
-- 1. set_updated_at: sin search_path fijo (lint 0011). Su cuerpo solo usa
--    NOW() (pg_catalog, siempre implícito) → search_path vacío es seguro.
-- 2. rls_auto_enable(): función de Supabase para el event trigger `ensure_rls`
--    (activa RLS en tablas nuevas de public). Es SECURITY DEFINER y estaba
--    expuesta por /rest/v1/rpc a anon/authenticated (lints 0028/0029).
--    No es explotable (solo funciona dentro de un evento DDL y solo activa
--    RLS), pero no debe ser invocable por la API. El ACL incluía PUBLIC, así
--    que hay que revocar también de PUBLIC. El event trigger sigue
--    funcionando: EXECUTE no se comprueba al dispararlo.
-- ============================================================================

ALTER FUNCTION public.set_updated_at() SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

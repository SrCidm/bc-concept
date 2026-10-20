-- ============================================================================
-- B&C: Concept — Migración v2.5: ajustes de margen editables (Hito 3 · 3.4a)
-- ----------------------------------------------------------------------------
-- Proyecto destino: ngctedqwmofhdvjowgva (bc_concept). Idempotente.
--
-- margin_settings guarda los parámetros de la guarda de margen que Yosra edita
-- desde /admin/ajustes. Es de SOLO INSERCIÓN: cada guardado es una fila nueva
-- y la vigente es la más reciente (el resto es el historial). El IVA NO está
-- aquí: es fijo en código (21 %).
--
-- Acceso: solo el backend (service_role) y solo SELECT + INSERT. anon y
-- authenticated no tienen ningún privilegio; RLS activado sin políticas. Un
-- trigger impide UPDATE/DELETE/TRUNCATE incluso al propietario de la tabla.
-- Los CHECK replican los rangos que valida el servidor (defensa en profundidad).
-- ============================================================================

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

NOTIFY pgrst, 'reload schema';

import "server-only";
import { requireAdmin as defaultRequireAdmin, type AdminAuth } from "@/lib/auth/requireAdmin";
import { previewMarginSettings, saveMarginSettings, type MarginSettingsDeps } from "@/lib/admin/marginSettings";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, marginSettingsErrorResponse, readJsonBody } from "./admin";

/**
 * Handlers de /api/admin/settings/margin[/preview] como factoría con
 * dependencias inyectables (sesión, almacén y fuente de ajustes): los route.ts
 * usan las reales y los tests pasan las suyas. Cada handler llama a
 * `requireAdmin` en su primera línea (lo vigila boundaries.test.ts).
 */

export interface SettingsRouteDeps extends MarginSettingsDeps {
  requireAdmin?: () => Promise<AdminAuth>;
}

export function settingsRoutes(deps: SettingsRouteDeps = {}) {
  const requireAdmin = deps.requireAdmin ?? (() => defaultRequireAdmin());

  return {
    /**
     * Guarda los ajustes: INSERTA una fila nueva en margin_settings (solo
     * inserción) con el email de la sesión; tras guardar, la guarda usa ya los nuevos.
     */
    margin: {
      async POST(req: Request) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await saveMarginSettings(await readJsonBody(req), deps);
          return result.ok ? jsonNoStore(result.data) : marginSettingsErrorResponse(result.code, result.fields);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Ejemplo en vivo con los valores del formulario (sin guardar). */
    marginPreview: {
      async POST(req: Request) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await previewMarginSettings(await readJsonBody(req), deps);
          return result.ok ? jsonNoStore(result.data) : marginSettingsErrorResponse(result.code, result.fields);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },
  };
}

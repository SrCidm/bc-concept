import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, marginSettingsErrorResponse, readJsonBody } from "@/lib/api/admin";
import { saveMarginSettings } from "@/lib/admin/marginSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Guarda los ajustes de margen: INSERTA una fila nueva en margin_settings (solo
 * inserción) con el email de la sesión. `saveMarginSettings` vuelve a exigir la
 * sesión y valida con rangos cerrados; tras guardar, la guarda usa ya los nuevos.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await saveMarginSettings(await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : marginSettingsErrorResponse(result.code, result.fields);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

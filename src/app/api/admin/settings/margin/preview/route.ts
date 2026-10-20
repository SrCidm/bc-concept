import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, marginSettingsErrorResponse, readJsonBody } from "@/lib/api/admin";
import { previewMarginSettings } from "@/lib/admin/marginSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ejemplo en vivo (calculado en el servidor) con los valores del formulario. No escribe nada. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await previewMarginSettings(await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : marginSettingsErrorResponse(result.code, result.fields);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

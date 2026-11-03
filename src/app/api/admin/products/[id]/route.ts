import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, PRODUCT_TEXT_BODY_BYTES, productErrorResponse, readJsonBody } from "@/lib/api/admin";
import { discardDraft, saveAdminProduct } from "@/lib/admin/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guarda textos ES/EN, categoría y PVP de un BORRADOR (un activo es de solo lectura). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await saveAdminProduct(params.id, await readJsonBody(req, PRODUCT_TEXT_BODY_BYTES));
    return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

/** Descarta un BORRADOR (nunca un activo: la BD lo rechaza). El historial conserva el evento. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await discardDraft(params.id);
    return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

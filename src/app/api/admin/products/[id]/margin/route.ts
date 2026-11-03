import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, productErrorResponse, readJsonBody } from "@/lib/api/admin";
import { previewProductMargin } from "@/lib/admin/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guarda en vivo al editar el PVP: coste y flete guardados, tipo y ajustes de hoy. No escribe. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await previewProductMargin(params.id, await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

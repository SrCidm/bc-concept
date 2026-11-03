import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, productErrorResponse, readJsonBody } from "@/lib/api/admin";
import { setSampleVerified } from "@/lib/admin/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marca o desmarca "verificado con muestra" (con nota obligatoria) en un BORRADOR. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await setSampleVerified(params.id, await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

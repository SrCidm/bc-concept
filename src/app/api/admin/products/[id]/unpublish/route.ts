import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, productErrorResponse } from "@/lib/api/admin";
import { unpublishProduct } from "@/lib/admin/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Devuelve un activo a borrador (sale de la tienda); los slugs se conservan. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await unpublishProduct(params.id);
    return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

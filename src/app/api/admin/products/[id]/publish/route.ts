import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, productErrorResponse, readJsonBody } from "@/lib/api/admin";
import { publishProduct } from "@/lib/admin/publishProduct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vuelve a pedir el producto al proveedor: CJ son 3 llamadas con ~2 s entre ellas. */
export const maxDuration = 60;

/** Publica un borrador si cumple TODAS las reglas con datos frescos (ver publishProduct.ts). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const result = await publishProduct(params.id, await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

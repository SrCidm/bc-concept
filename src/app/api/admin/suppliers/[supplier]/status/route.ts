import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, jsonNoStore } from "@/lib/api/admin";
import { getCredentialStatus } from "@/lib/suppliers/credentials";
import { SupplierError } from "@/lib/suppliers/errors";
import { getSupplierAdapter, parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado de la credencial del proveedor. NUNCA devuelve la API key. */
export async function GET(_req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const id = parseSupplierId(params.supplier);
    if (!id) throw new SupplierError("not_found");
    const adapter = getSupplierAdapter(id); // 501 si el proveedor aún no está migrado

    const status = await getCredentialStatus(id);
    const auth = status.configured
      ? await adapter.auth()
      : ({ ok: false, code: "not_configured" } as const);

    return jsonNoStore({ supplier: id, ...status, auth });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

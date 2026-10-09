import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, jsonNoStore } from "@/lib/api/admin";
import { marginSettings } from "@/lib/pricing/settings";
import { toAdminProductDTO } from "@/lib/suppliers/dto";
import { SupplierError } from "@/lib/suppliers/errors";
import { getSupplierAdapter, parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { supplier: string; id: string } }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const supplier = parseSupplierId(params.supplier);
    if (!supplier) throw new SupplierError("not_found");
    const adapter = getSupplierAdapter(supplier);

    const lang = new URL(req.url).searchParams.get("lang") ?? "es";
    if (lang !== "es" && lang !== "en") throw new SupplierError("invalid_request");

    const product = await adapter.getProduct(params.id, { lang });
    if (!product) throw new SupplierError("not_found");
    return jsonNoStore(toAdminProductDTO(product, await marginSettings().get()));
  } catch (e) {
    return adminErrorResponse(e);
  }
}

import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, jsonNoStore, parseProductsQuery } from "@/lib/api/admin";
import { parseMarginParams } from "@/lib/pricing/margin";
import { toAdminPageDTO } from "@/lib/suppliers/dto";
import { SupplierError } from "@/lib/suppliers/errors";
import { getSupplierAdapter, parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catálogo del proveedor para la admin. El DTO incluye coste y margen: solo
 * llega aquí tras requireAdmin (la regla #1 protege el storefront público).
 */
export async function GET(req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const id = parseSupplierId(params.supplier);
    if (!id) throw new SupplierError("not_found");
    const adapter = getSupplierAdapter(id);

    const q = parseProductsQuery(new URL(req.url).searchParams);
    const page = await adapter.listProducts({
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
      query: q.query,
      lang: q.lang,
      euOnly: q.euOnly,
      inStockOnly: q.inStockOnly,
    });
    return jsonNoStore(toAdminPageDTO(page, parseMarginParams()));
  } catch (e) {
    return adminErrorResponse(e);
  }
}

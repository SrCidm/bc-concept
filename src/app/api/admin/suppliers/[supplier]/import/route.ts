import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, importErrorResponse, jsonNoStore, readJsonBody } from "@/lib/api/admin";
import { importProduct } from "@/lib/admin/importProduct";
import { SupplierError } from "@/lib/suppliers/errors";
import { parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Importa un producto del proveedor como BORRADOR. Escribe con service role solo
 * tras `requireAdmin` (y `importProduct` vuelve a exigir la sesión). Con el mock
 * activo es una simulación: no escribe nada. Idempotente por (supplier, supplier_product_id).
 */
export async function POST(req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const supplier = parseSupplierId(params.supplier);
    if (!supplier) throw new SupplierError("not_found");
    if (supplier !== "bigbuy") throw new SupplierError("unsupported"); // CJ aún no migrado

    const result = await importProduct(supplier, await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : importErrorResponse(result.code, result.check);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

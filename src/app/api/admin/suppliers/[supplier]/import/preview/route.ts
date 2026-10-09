import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, importErrorResponse, jsonNoStore, readJsonBody } from "@/lib/api/admin";
import { previewImport } from "@/lib/admin/importProduct";
import { SupplierError } from "@/lib/suppliers/errors";
import { parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vista previa de la importación: resumen del producto (con coste: solo admin) y
 * guarda de margen calculada EN EL SERVIDOR al PVP indicado. No escribe nada.
 * POST (con comprobación de mismo origen) porque el cuerpo lleva el PVP.
 */
export async function POST(req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const supplier = parseSupplierId(params.supplier);
    if (!supplier) throw new SupplierError("not_found");
    if (supplier !== "bigbuy") throw new SupplierError("unsupported"); // CJ aún no migrado

    const result = await previewImport(supplier, await readJsonBody(req));
    return result.ok ? jsonNoStore(result.data) : importErrorResponse(result.code);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

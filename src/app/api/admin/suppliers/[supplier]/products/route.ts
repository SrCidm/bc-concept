import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, jsonNoStore, parseProductsQuery } from "@/lib/api/admin";
import { listAdminCatalog } from "@/lib/admin/catalog";
import { SupplierError } from "@/lib/suppliers/errors";
import { parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catálogo del proveedor para la admin. El DTO incluye coste y margen: solo
 * llega aquí tras requireAdmin (la regla #1 protege el storefront público).
 * `listAdminCatalog` vuelve a comprobar la sesión por su cuenta (es la misma
 * función que usa el panel).
 */
export async function GET(req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const id = parseSupplierId(params.supplier);
    if (!id) throw new SupplierError("not_found");
    if (id !== "bigbuy") throw new SupplierError("unsupported"); // CJ aún no migrado

    const q = parseProductsQuery(new URL(req.url).searchParams);
    const result = await listAdminCatalog(q);
    if (!result.ok) {
      if (result.code === "unauthenticated" || result.code === "forbidden") {
        // La sesión caducó entre la guarda y la consulta: mismo contrato que requireAdmin.
        return jsonNoStore(
          { error: { code: result.code, message: "Sesión no válida." } },
          result.code === "unauthenticated" ? 401 : 403
        );
      }
      throw new SupplierError(result.code);
    }
    return jsonNoStore(result.data);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

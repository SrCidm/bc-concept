import { requireAdmin } from "@/lib/auth/requireAdmin";
import { adminErrorResponse, assertSameOrigin, jsonNoStore } from "@/lib/api/admin";
import {
  deleteApiKey,
  getCredentialStatus,
  setApiKey,
} from "@/lib/suppliers/credentials";
import { SupplierError } from "@/lib/suppliers/errors";
import { getSupplierAdapter, parseSupplierId } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PATTERN = /^\S{8,512}$/;

function resolveSupplier(raw: string) {
  const id = parseSupplierId(raw);
  if (!id) throw new SupplierError("not_found");
  getSupplierAdapter(id); // 501 antes de escribir nada si no está soportado
  return id;
}

/** Guarda/rota la API key. La respuesta NUNCA la incluye. */
export async function PUT(req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const id = resolveSupplier(params.supplier);

    if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new SupplierError("invalid_request");
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new SupplierError("invalid_request");
    }
    const apiKey =
      body && typeof body === "object" && "apiKey" in body
        ? (body as { apiKey: unknown }).apiKey
        : null;
    if (typeof apiKey !== "string" || !KEY_PATTERN.test(apiKey.trim())) {
      throw new SupplierError("invalid_request");
    }

    await setApiKey(id, apiKey.trim());
    return jsonNoStore({ supplier: id, ...(await getCredentialStatus(id)) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { supplier: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    assertSameOrigin(req);
    const id = resolveSupplier(params.supplier);
    await deleteApiKey(id);
    return jsonNoStore({ supplier: id, ...(await getCredentialStatus(id)) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

import "server-only";
import { requireAdmin as defaultRequireAdmin, type AdminAuth, type AdminDecision } from "@/lib/auth/requireAdmin";
import { listAdminCatalog } from "@/lib/admin/catalog";
import { importProduct, previewImport, type ProductStore } from "@/lib/admin/importProduct";
import type { MarginParams } from "@/lib/pricing/margin";
import { marginSettings } from "@/lib/pricing/settings";
import { deleteApiKey, getCredentialStatus, setApiKey, type CredentialStore } from "@/lib/suppliers/credentials";
import { toAdminProductDTO } from "@/lib/suppliers/dto";
import { SupplierError } from "@/lib/suppliers/errors";
import {
  getMockFailure as defaultMockFailure,
  getSupplierAdapter,
  isCatalogMock as defaultIsCatalogMock,
  isSimulatedImport as defaultIsSimulatedImport,
  parseSupplierId,
  type MockScenario,
} from "@/lib/suppliers/registry";
import type { SupplierAdapter, SupplierId } from "@/lib/suppliers/types";
import { adminErrorResponse, assertSameOrigin, importErrorResponse, jsonNoStore, parseProductsQuery, readJsonBody } from "./admin";

/**
 * Handlers de /api/admin/suppliers/[supplier]/** como factoría con dependencias
 * inyectables: los route.ts usan las reales y los tests pasan las suyas (sesión,
 * adaptador, credenciales, ajustes), sin sustituir módulos. Cada handler llama a
 * `requireAdmin` en su primera línea (lo vigila boundaries.test.ts).
 */

export interface SupplierRouteDeps {
  requireAdmin?: () => Promise<AdminAuth>;
  /** La re-comprobación de sesión de lib/admin (catálogo e importación). */
  resolve?: () => Promise<AdminDecision>;
  getAdapter?: (id: SupplierId) => SupplierAdapter;
  credentials?: CredentialStore;
  /** Variables para la key de entorno y el mock (por defecto, process.env). */
  env?: Record<string, string | undefined>;
  isCatalogMock?: (id: SupplierId) => boolean;
  isSimulatedImport?: (id: SupplierId) => boolean;
  mockFailure?: () => MockScenario | null;
  getMarginParams?: () => Promise<MarginParams>;
  importStore?: ProductStore;
}

type SupplierCtx = { params: { supplier: string } };
type ProductCtx = { params: { supplier: string; id: string } };

const KEY_PATTERN = /^\S{8,512}$/;

export function supplierRoutes(deps: SupplierRouteDeps = {}) {
  const requireAdmin = deps.requireAdmin ?? (() => defaultRequireAdmin());
  const getAdapter = deps.getAdapter ?? getSupplierAdapter;
  const isCatalogMock = deps.isCatalogMock ?? ((id: SupplierId) => defaultIsCatalogMock(id, deps.env));
  const isSimulatedImport = deps.isSimulatedImport ?? ((id: SupplierId) => defaultIsSimulatedImport(id, deps.env));
  const mockFailure = deps.mockFailure ?? (() => defaultMockFailure(deps.env));
  const getMarginParams = deps.getMarginParams ?? (() => marginSettings().get());
  const credentialDeps = { store: deps.credentials, env: deps.env };

  const supplierFrom = (raw: string): SupplierId => {
    const id = parseSupplierId(raw);
    if (!id) throw new SupplierError("not_found");
    return id;
  };
  const importDeps = (supplier: SupplierId) => ({
    resolve: deps.resolve,
    getAdapter: () => getAdapter(supplier),
    getParams: deps.getMarginParams,
    isMock: () => isSimulatedImport(supplier),
    store: deps.importStore,
  });

  return {
    /** Estado de la conexión: si hay credencial (nunca la key) y si el proveedor la acepta. */
    status: {
      async GET(_req: Request, { params }: SupplierCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          const id = supplierFrom(params.supplier);
          const adapter = getAdapter(id);
          // Con el mock activo (solo fuera de producción) el estado lo decide el adaptador simulado.
          const mock = isCatalogMock(id);
          const status = mock
            ? { configured: mockFailure() !== "not_configured", source: "none" as const, updatedAt: null }
            : await getCredentialStatus(id, credentialDeps);
          const auth = status.configured ? await adapter.auth() : ({ ok: false, code: "not_configured" } as const);
          return jsonNoStore({ supplier: id, ...status, auth, mock });
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Catálogo del proveedor (con coste: dato de admin). */
    products: {
      async GET(req: Request, { params }: SupplierCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          const id = supplierFrom(params.supplier);
          const q = parseProductsQuery(new URL(req.url).searchParams);
          const result = await listAdminCatalog(
            { ...q, supplier: id },
            { resolve: deps.resolve, getAdapter: () => getAdapter(id), getMarginParams, isMock: () => isCatalogMock(id) }
          );
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
      },
    },

    /** Un producto del proveedor (con coste: dato de admin). */
    product: {
      async GET(req: Request, { params }: ProductCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          const adapter = getAdapter(supplierFrom(params.supplier));
          const lang = new URL(req.url).searchParams.get("lang") ?? "es";
          if (lang !== "es" && lang !== "en") throw new SupplierError("invalid_request");
          const product = await adapter.getProduct(params.id, { lang });
          if (!product) throw new SupplierError("not_found");
          return jsonNoStore(toAdminProductDTO(product, await getMarginParams()));
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Guardar (PUT) o borrar (DELETE) la API key. La respuesta nunca la incluye. */
    credentials: {
      async PUT(req: Request, { params }: SupplierCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const id = supplierFrom(params.supplier);
          getAdapter(id); // 501 antes de escribir nada si no está soportado
          if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
            throw new SupplierError("invalid_request");
          }
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            throw new SupplierError("invalid_request");
          }
          const apiKey = body && typeof body === "object" && "apiKey" in body ? (body as { apiKey: unknown }).apiKey : null;
          if (typeof apiKey !== "string" || !KEY_PATTERN.test(apiKey.trim())) {
            throw new SupplierError("invalid_request");
          }
          await setApiKey(id, apiKey.trim(), credentialDeps);
          return jsonNoStore({ supplier: id, ...(await getCredentialStatus(id, credentialDeps)) });
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
      async DELETE(req: Request, { params }: SupplierCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const id = supplierFrom(params.supplier);
          getAdapter(id);
          await deleteApiKey(id, credentialDeps);
          return jsonNoStore({ supplier: id, ...(await getCredentialStatus(id, credentialDeps)) });
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Datos del modal de importación y guarda de margen al PVP pedido. No escribe. */
    importPreview: {
      async POST(req: Request, { params }: SupplierCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const supplier = supplierFrom(params.supplier);
          const result = await previewImport(supplier, await readJsonBody(req), importDeps(supplier));
          return result.ok ? jsonNoStore(result.data) : importErrorResponse(result.code);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Importa como BORRADOR (o simula, según el proveedor). Idempotente. */
    import: {
      async POST(req: Request, { params }: SupplierCtx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const supplier = supplierFrom(params.supplier);
          const result = await importProduct(supplier, await readJsonBody(req), importDeps(supplier));
          return result.ok ? jsonNoStore(result.data) : importErrorResponse(result.code, result.check);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },
  };
}

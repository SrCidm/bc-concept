import "server-only";
import { requireAdmin as defaultRequireAdmin, type AdminAuth } from "@/lib/auth/requireAdmin";
import {
  discardDraft,
  previewProductMargin,
  saveAdminProduct,
  setSampleVerified,
  unpublishProduct,
  type ProductsDeps,
} from "@/lib/admin/products";
import { publishProduct, type PublishDeps } from "@/lib/admin/publishProduct";
import { adminErrorResponse, assertSameOrigin, jsonNoStore, PRODUCT_TEXT_BODY_BYTES, productErrorResponse, readJsonBody } from "./admin";

/**
 * Handlers de /api/admin/products/[id]/** como factoría con dependencias
 * inyectables: los route.ts usan las reales y los tests pasan las suyas
 * directamente (sesión, repositorio, proveedor…), sin sustituir módulos.
 * Cada handler llama a `requireAdmin` en su primera línea (lo vigila
 * boundaries.test.ts) y las funciones de lib/admin vuelven a exigir la sesión.
 */

export interface ProductRouteDeps extends ProductsDeps, PublishDeps {
  requireAdmin?: () => Promise<AdminAuth>;
}

type Ctx = { params: { id: string } };

export function productRoutes(deps: ProductRouteDeps = {}) {
  const requireAdmin = deps.requireAdmin ?? (() => defaultRequireAdmin());

  return {
    /** PATCH guarda textos ES/EN, categoría y PVP de un borrador; DELETE lo descarta. */
    item: {
      async PATCH(req: Request, { params }: Ctx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await saveAdminProduct(params.id, await readJsonBody(req, PRODUCT_TEXT_BODY_BYTES), deps);
          return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
      async DELETE(req: Request, { params }: Ctx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await discardDraft(params.id, deps);
          return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Guarda en vivo al editar el PVP. No escribe. */
    margin: {
      async POST(req: Request, { params }: Ctx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await previewProductMargin(params.id, await readJsonBody(req), deps);
          return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Marca o desmarca "verificado con muestra" (nota obligatoria al marcar). */
    sample: {
      async POST(req: Request, { params }: Ctx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await setSampleVerified(params.id, await readJsonBody(req), deps);
          return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Publica si cumple TODAS las reglas con datos frescos (ver publishProduct.ts). */
    publish: {
      async POST(req: Request, { params }: Ctx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await publishProduct(params.id, await readJsonBody(req), deps);
          return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },

    /** Devuelve un activo a borrador; los slugs se conservan. */
    unpublish: {
      async POST(req: Request, { params }: Ctx) {
        const admin = await requireAdmin();
        if (!admin.ok) return admin.response;
        try {
          assertSameOrigin(req);
          const result = await unpublishProduct(params.id, deps);
          return result.ok ? jsonNoStore(result.data) : productErrorResponse(result);
        } catch (e) {
          return adminErrorResponse(e);
        }
      },
    },
  };
}

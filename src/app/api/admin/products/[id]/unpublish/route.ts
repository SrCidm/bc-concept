import { productRoutes } from "@/lib/api/productRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Devuelve un activo a borrador. Lógica en lib/api/productRoutes.ts. */
export const { POST } = productRoutes().unpublish;

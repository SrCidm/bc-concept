import { productRoutes } from "@/lib/api/productRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guarda en vivo al editar el PVP (no escribe). Lógica en lib/api/productRoutes.ts. */
export const { POST } = productRoutes().margin;

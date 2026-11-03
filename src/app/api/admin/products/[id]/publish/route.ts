import { productRoutes } from "@/lib/api/productRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vuelve a pedir el producto al proveedor: CJ son 3 llamadas con ~2 s entre ellas. */
export const maxDuration = 60;

/** Publica un borrador si cumple todas las reglas. Lógica en lib/api/productRoutes.ts. */
export const { POST } = productRoutes().publish;

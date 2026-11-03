import { productRoutes } from "@/lib/api/productRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verificado con muestra. Lógica en lib/api/productRoutes.ts. */
export const { POST } = productRoutes().sample;

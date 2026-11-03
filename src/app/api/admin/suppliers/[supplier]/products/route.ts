import { supplierRoutes } from "@/lib/api/supplierRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** CJ: llamadas con ~2 s de cola entre ellas, más token y reintentos si limita. */
export const maxDuration = 60;

/** Catálogo del proveedor (con coste, solo admin). Lógica en lib/api/supplierRoutes.ts. */
export const { GET } = supplierRoutes().products;

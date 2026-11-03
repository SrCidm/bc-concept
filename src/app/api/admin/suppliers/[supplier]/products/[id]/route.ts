import { supplierRoutes } from "@/lib/api/supplierRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un producto del proveedor (con coste, solo admin). Lógica en lib/api/supplierRoutes.ts. */
export const { GET } = supplierRoutes().product;

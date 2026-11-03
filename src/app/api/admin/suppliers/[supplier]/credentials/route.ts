import { supplierRoutes } from "@/lib/api/supplierRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guardar o borrar la API key del proveedor (nunca se devuelve). Lógica en lib/api/supplierRoutes.ts. */
export const { PUT, DELETE } = supplierRoutes().credentials;

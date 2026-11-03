import { productRoutes } from "@/lib/api/productRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guarda (PATCH) o descarta (DELETE) un borrador. Lógica en lib/api/productRoutes.ts. */
export const { PATCH, DELETE } = productRoutes().item;

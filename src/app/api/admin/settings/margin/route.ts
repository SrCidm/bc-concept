import { settingsRoutes } from "@/lib/api/settingsRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guardar los ajustes de margen (solo inserción). Lógica en lib/api/settingsRoutes.ts. */
export const { POST } = settingsRoutes().margin;

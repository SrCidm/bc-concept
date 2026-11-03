import { settingsRoutes } from "@/lib/api/settingsRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ejemplo en vivo de los ajustes de margen. Lógica en lib/api/settingsRoutes.ts. */
export const { POST } = settingsRoutes().marginPreview;

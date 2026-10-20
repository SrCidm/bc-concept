import { mock } from "bun:test";

// `server-only` lanza al importarse fuera de un entorno react-server (Next lo
// resuelve por condición de export). En los tests de servidor se anula.
mock.module("server-only", () => ({}));

// Ajustes de margen: `bun test` NUNCA lee ni escribe la BD real (Bun carga
// .env.local, así que sin esto la fuente de ajustes consultaría producción).
// Por defecto no hay filas guardados → entorno/valores por defecto. Escribir sin
// inyectar un almacén propio es un error del test.
mock.module("@/lib/pricing/settingsStore", () => ({
  supabaseMarginSettingsStore: {
    latest: async () => null,
    history: async () => [],
    insert: async () => {
      throw new Error("test: inyecta un MarginSettingsStore en memoria para escribir ajustes");
    },
  },
}));

import "server-only";
import { SupplierError } from "./errors";
import { createBigBuyAdapter } from "./bigbuy";
import { createMockBigBuyFetch, type MockFailure } from "./bigbuy/mock/transport";
import type { SupplierAdapter, SupplierId } from "./types";

const KNOWN: ReadonlySet<string> = new Set<SupplierId>(["bigbuy", "cj"]);

/** Valida el segmento de URL `[supplier]` contra la lista cerrada de proveedores. */
export function parseSupplierId(raw: string): SupplierId | null {
  return KNOWN.has(raw) ? (raw as SupplierId) : null;
}

type Env = Record<string, string | undefined>;

/**
 * El mock de BigBuy (`BIGBUY_MOCK=1`) solo existe fuera de producción: en
 * `NODE_ENV=production` se ignora por completo (fail-closed), de modo que una
 * variable olvidada en el entorno nunca sirve datos de ejemplo en la tienda real.
 */
export function isMockEnabled(env: Env = process.env): boolean {
  return env.BIGBUY_MOCK === "1" && env.NODE_ENV !== "production";
}

export type MockScenario = MockFailure | "not_configured";

const SCENARIOS: ReadonlySet<string> = new Set<MockScenario>([
  "unauthorized",
  "rate_limited",
  "upstream",
  "not_configured",
]);

/** Fallo simulado (solo con el mock activo): `BIGBUY_MOCK_FAIL=unauthorized|…`. */
export function getMockFailure(env: Env = process.env): MockScenario | null {
  if (!isMockEnabled(env)) return null;
  const v = env.BIGBUY_MOCK_FAIL?.trim();
  return v && SCENARIOS.has(v) ? (v as MockScenario) : null;
}

function mockLatencyMs(env: Env): number {
  const n = Number(env.BIGBUY_MOCK_LATENCY_MS);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), 5000) : 0;
}

/** Rutas locales (`/admin-mock/…`) o https: las imágenes del mock viven en /public. */
const isMockImageUrl = (u: string) => u.startsWith("/admin-mock/") || u.startsWith("https://");

/**
 * Adaptador REAL de BigBuy sobre un transporte falso: ejercita mappers, filtro UE,
 * reintentos y DTO. Solo el `fetch` es simulado.
 */
export function createMockBigBuyAdapter(env: Env = process.env): SupplierAdapter {
  const scenario = getMockFailure(env);
  return createBigBuyAdapter({
    baseUrl: "https://mock.bigbuy.invalid",
    fetchImpl: createMockBigBuyFetch({
      fail: scenario && scenario !== "not_configured" ? scenario : null,
      latencyMs: mockLatencyMs(env),
    }),
    getApiKey: async () => (scenario === "not_configured" ? null : "mock-key"),
    isAllowedImageUrl: isMockImageUrl,
    // Los reintentos del adaptador no deben ralentizar el panel en desarrollo.
    sleep: async () => {},
  });
}

let bigbuy: { adapter: SupplierAdapter; mode: string } | null = null;

/**
 * Proveedor → adaptador. CJ está pendiente de migrar a esta interfaz (hoy vive
 * en `src/lib/cj/` con el proveedor cableado): responde 501, sin tocar nada.
 */
export function getSupplierAdapter(id: SupplierId): SupplierAdapter {
  if (id === "bigbuy") {
    // La caché va por modo: cambiar BIGBUY_MOCK / BIGBUY_MOCK_FAIL en caliente no reutiliza el adaptador anterior.
    const mode = isMockEnabled()
      ? `mock:${getMockFailure() ?? ""}:${process.env.BIGBUY_MOCK_LATENCY_MS ?? ""}`
      : "live";
    if (!bigbuy || bigbuy.mode !== mode) {
      bigbuy = {
        adapter: mode === "live" ? createBigBuyAdapter() : createMockBigBuyAdapter(),
        mode,
      };
    }
    return bigbuy.adapter;
  }
  throw new SupplierError("unsupported");
}

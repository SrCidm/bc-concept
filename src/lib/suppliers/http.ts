import "server-only";
import { SupplierError } from "./errors";

export interface HttpDeps {
  fetchImpl?: typeof fetch;
  /** Inyectable para tests (sin esperas reales). */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Reintentos tras el primer intento (regla #4: máx. 3). */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 300;
const MAX_RETRY_AFTER_MS = 10_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * GET/POST JSON a un proveedor con timeout y reintentos (429 y 5xx, con
 * Retry-After). Traduce todo fallo a SupplierError con mensaje seguro: jamás
 * propaga cuerpo, cabeceras ni URL del proveedor.
 */
export async function supplierFetchJson(
  url: string,
  init: RequestInit,
  deps: HttpDeps = {}
): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.min(deps.maxRetries ?? MAX_RETRIES, MAX_RETRIES);

  let lastError: SupplierError = new SupplierError("upstream");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      lastError = new SupplierError(aborted ? "timeout" : "upstream", { cause: e });
      if (attempt < maxRetries) await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      continue;
    }
    clearTimeout(timer);

    if (res.ok) {
      try {
        return await res.json();
      } catch (e) {
        throw new SupplierError("bad_response", { cause: e });
      }
    }

    // Errores definitivos: no se reintentan.
    if (res.status === 401 || res.status === 403) throw new SupplierError("unauthorized");
    if (res.status === 404) throw new SupplierError("not_found");
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new SupplierError("invalid_request");
    }

    // 429 / 5xx: reintentable.
    lastError = new SupplierError(res.status === 429 ? "rate_limited" : "upstream");
    if (attempt < maxRetries) {
      await sleep(retryAfterMs(res) ?? BASE_BACKOFF_MS * 2 ** attempt);
    }
  }

  throw lastError;
}

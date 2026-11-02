import "server-only";
import { SupplierError, type SupplierErrorCode } from "../errors";
import { rec } from "../raw";
import { CJ_BASE_URL } from "./endpoints";

/**
 * Transporte de CJ: cola de una petición cada vez, reintentos y traducción de
 * errores. Nunca propaga el `message` de CJ (regla #8).
 *
 * El límite documentado es 1 petición/s, pero a una cada 1,2 s CJ ya devolvió
 * 1600200; esperando ~2 s tras cada respuesta no volvió a ocurrir. La cola se
 * guarda en `globalThis` porque Next empaqueta cada ruta por separado. Es por
 * proceso: entre instancias de Vercel no se coordina y lo absorben los reintentos.
 */
export interface CjClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  /** Espera mínima entre el fin de una respuesta y la petición siguiente. */
  gapMs?: number;
  baseUrl?: string;
  queue?: CjQueue;
}

export interface CjQueue {
  tail: Promise<unknown>;
  lastFinishedAt: number;
}

export interface CjRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
  token?: string;
}

const DEFAULT_GAP_MS = 2000;
const DEFAULT_TIMEOUT_MS = 15_000;
/** Reintentos tras el primer intento (regla #4: máx. 3). */
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

const globalStore = globalThis as unknown as { __bcCjQueue?: CjQueue };

function sharedQueue(): CjQueue {
  globalStore.__bcCjQueue ??= { tail: Promise.resolve(), lastFinishedAt: 0 };
  return globalStore.__bcCjQueue;
}

/** Sobre correcto: `200` en general, `0` en la lista de almacenes. */
const OK_CODES: ReadonlySet<number> = new Set([200, 0]);
/** El token ya no vale: se puede renovar y reintentar una vez. */
const TOKEN_REJECTED: ReadonlySet<number> = new Set([1600001, 1600002]);
/** Puntos diarios agotados: reintentar no sirve hasta que se repongan. */
const OUT_OF_POINTS: ReadonlySet<number> = new Set([429, 1600201, 16900500]);

const CODE_MAP: ReadonlyMap<number, SupplierErrorCode> = new Map<number, SupplierErrorCode>([
  [1600001, "unauthorized"],
  [1600002, "unauthorized"],
  [1600003, "unauthorized"],
  [1600004, "unauthorized"],
  [1600005, "unauthorized"],
  [1600006, "unauthorized"],
  [1600008, "unauthorized"],
  [1600014, "unauthorized"], // API suspendida para la cuenta
  [1601000, "unauthorized"],
  [1600300, "invalid_request"],
  [1605002, "invalid_request"],
  [16900202, "invalid_request"],
  [16900203, "invalid_request"],
  [16900204, "invalid_request"],
  [16900205, "invalid_request"],
  [16900403, "invalid_request"],
  [1602000, "not_found"],
  [1602001, "not_found"],
  [1602002, "not_found"],
  [1602003, "not_found"],
  [1605000, "not_found"],
]);

const RETRYABLE_CODES: ReadonlyMap<number, SupplierErrorCode> = new Map<number, SupplierErrorCode>([
  [1600200, "rate_limited"],
  [1600000, "upstream"],
  [1600301, "timeout"],
]);

type Outcome =
  | { kind: "ok"; data: unknown }
  | { kind: "retry"; code: SupplierErrorCode }
  | { kind: "fail"; code: SupplierErrorCode; tokenRejected?: boolean };

/** Traduce una respuesta HTTP + sobre de CJ. Función pura, testeable. */
export function classifyCjResponse(status: number, json: unknown): Outcome {
  const envelope = rec(json);
  const code = typeof envelope?.code === "number" ? envelope.code : null;

  if (code !== null) {
    if (OK_CODES.has(code) && status >= 200 && status < 300 && envelope?.result !== false) {
      return { kind: "ok", data: envelope?.data ?? null };
    }
    if (OUT_OF_POINTS.has(code)) return { kind: "fail", code: "rate_limited" };
    const retryable = RETRYABLE_CODES.get(code);
    if (retryable) return { kind: "retry", code: retryable };
    if (TOKEN_REJECTED.has(code)) return { kind: "fail", code: "unauthorized", tokenRejected: true };
    return { kind: "fail", code: CODE_MAP.get(code) ?? "upstream" };
  }

  // Sin sobre reconocible: se decide por el estado HTTP.
  if (status === 429) return { kind: "retry", code: "rate_limited" };
  if (status === 401 || status === 403) return { kind: "fail", code: "unauthorized", tokenRejected: true };
  if (status === 404) return { kind: "fail", code: "not_found" };
  if (status >= 500) return { kind: "retry", code: "upstream" };
  if (status >= 400) return { kind: "fail", code: "invalid_request" };
  return { kind: "fail", code: "bad_response" };
}

/** ¿El error es de token rechazado (renovable), no de credencial inválida? */
export function isTokenRejected(e: unknown): boolean {
  if (!(e instanceof SupplierError) || e.code !== "unauthorized") return false;
  return rec((e as Error & { cause?: unknown }).cause)?.tokenRejected === true;
}

/**
 * Diagnóstico en los logs del servidor: ruta, estado y código de CJ. Nunca el
 * cuerpo ni la cabecera. CJ limita a 3 cuentas por IP y en Vercel las IP son
 * compartidas: ese caso se distingue para poder reconocerlo en los logs.
 */
function logFailure(path: string, status: number, body: unknown): void {
  const envelope = rec(body);
  const sharedIp = typeof envelope?.message === "string" && /one ip limit/i.test(envelope.message);
  console.error(`[cj] ${path} HTTP ${status} code=${String(envelope?.code ?? "-")}${sharedIp ? " límite por IP compartida" : ""}`);
}

export interface CjClient {
  call(req: CjRequest): Promise<unknown>;
}

export function createCjClient(deps: CjClientDeps = {}): CjClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const gapMs = deps.gapMs ?? DEFAULT_GAP_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = deps.baseUrl ?? CJ_BASE_URL;

  /** Una petición cada vez, respetando la espera desde la respuesta anterior. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const queue = deps.queue ?? sharedQueue();
    const run = queue.tail.then(async () => {
      const wait = queue.lastFinishedAt + gapMs - now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        queue.lastFinishedAt = now();
      }
    });
    queue.tail = run.catch(() => undefined);
    return run;
  }

  async function attempt(req: CjRequest): Promise<Outcome> {
    const qs = req.query
      ? "?" + new URLSearchParams(Object.entries(req.query).map(([k, v]) => [k, String(v)])).toString()
      : "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}${req.path}${qs}`, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(req.token ? { "CJ-Access-Token": req.token } : {}),
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
        cache: "no-store",
      });
      const body: unknown = await res.json().catch(() => null);
      const outcome = classifyCjResponse(res.status, body);
      if (outcome.kind !== "ok") logFailure(req.path, res.status, body);
      return outcome;
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { kind: "retry", code: aborted ? "timeout" : "upstream" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async call(req) {
      let last: SupplierErrorCode = "upstream";
      for (let n = 0; n <= MAX_RETRIES; n++) {
        // Cada intento pasa por la cola: un reintento tampoco puede saltarse el límite.
        const outcome = await enqueue(() => attempt(req));
        if (outcome.kind === "ok") return outcome.data;
        if (outcome.kind === "fail") {
          throw new SupplierError(outcome.code, { cause: { tokenRejected: outcome.tokenRejected === true } });
        }
        last = outcome.code;
        if (n < MAX_RETRIES) await sleep(BASE_BACKOFF_MS * 2 ** n);
      }
      throw new SupplierError(last);
    },
  };
}

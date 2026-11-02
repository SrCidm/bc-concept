import "server-only";
import type { SupplierTokens, TokenStore } from "../credentials";
import { SupplierError, isSupplierError } from "../errors";
import { rec, text } from "../raw";
import type { CjClient } from "./client";
import { CJ_ENDPOINTS } from "./endpoints";

/**
 * Sesión con CJ. El token dura 180 días y se guarda en `supplier_credentials`
 * (solo service role): se reutiliza siempre, nunca uno por petición.
 *
 *   válido → reutilizar · a menos de 24 h de caducar → `refreshAccessToken`
 *   refresh inválido o caducado → `getAccessToken` con la API key
 *
 * Una sola renovación a la vez por proceso (single-flight). Estado en `globalThis`
 * porque Next empaqueta cada ruta por separado. Los tokens nunca van a logs ni a
 * errores: si fallan los lectores, solo se registra un mensaje fijo.
 */
export interface CjAuthState {
  current: SupplierTokens | null;
  /** Cuándo se leyó de la BD: otro proceso puede haberlo rotado. */
  loadedAt: number;
  /** Token rechazado por CJ: no se reutiliza aunque la BD aún lo tenga. */
  rejected: string | null;
  inflight: Promise<string> | null;
}

export interface CjAuthDeps {
  client: CjClient;
  getApiKey: () => Promise<string | null>;
  store: TokenStore;
  now?: () => number;
  state?: CjAuthState;
}

export interface CjAuth {
  getToken(): Promise<string>;
  /** CJ rechazó este token: el siguiente `getToken` lo renueva. */
  invalidate(token: string): void;
}

const RENEW_BEFORE_MS = 24 * 60 * 60_000;
const RELOAD_EVERY_MS = 5 * 60_000;
/** Si CJ no informa de la caducidad se revisa a diario (dentro de 24 h devuelve el mismo token). */
const UNKNOWN_EXPIRY_MS = 24 * 60 * 60_000;

const globalStore = globalThis as unknown as { __bcCjAuth?: CjAuthState };

function sharedState(): CjAuthState {
  globalStore.__bcCjAuth ??= { current: null, loadedAt: 0, rejected: null, inflight: null };
  return globalStore.__bcCjAuth;
}

/** Lee la respuesta de `getAccessToken`/`refreshAccessToken`. */
export function parseTokens(data: unknown, now: number): SupplierTokens {
  const d = rec(data);
  const accessToken = text(d?.accessToken);
  if (!accessToken) throw new SupplierError("bad_response");
  const expiry = (v: unknown, fallbackMs: number) => {
    const raw = text(v);
    const ms = raw ? Date.parse(raw) : NaN;
    return new Date(Number.isFinite(ms) ? ms : now + fallbackMs).toISOString();
  };
  const refreshToken = text(d?.refreshToken);
  return {
    accessToken,
    accessTokenExpiry: expiry(d?.accessTokenExpiryDate, UNKNOWN_EXPIRY_MS),
    refreshToken,
    refreshTokenExpiry: refreshToken ? expiry(d?.refreshTokenExpiryDate, UNKNOWN_EXPIRY_MS) : null,
  };
}

export function createCjAuth(deps: CjAuthDeps): CjAuth {
  const now = deps.now ?? Date.now;
  const state = deps.state ?? sharedState();

  const expiresAt = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
  const usable = (t: SupplierTokens): boolean => {
    if (t.accessToken === state.rejected) return false;
    const at = expiresAt(t.accessTokenExpiry);
    return Number.isFinite(at) && at - now() > RENEW_BEFORE_MS;
  };

  async function remember(tokens: SupplierTokens): Promise<string> {
    state.current = tokens;
    state.loadedAt = now();
    state.rejected = null;
    try {
      await deps.store.save(tokens);
    } catch {
      // Sigue valiendo en memoria; CJ devuelve el mismo token durante 24 h.
      console.error("[cj] no se pudo guardar la sesión");
    }
    return tokens.accessToken;
  }

  async function load(): Promise<SupplierTokens | null> {
    try {
      return await deps.store.load();
    } catch {
      console.error("[cj] no se pudo leer la sesión");
      return null;
    }
  }

  async function renew(): Promise<string> {
    const stored = await load();
    state.loadedAt = now();
    state.current = stored ?? state.current;
    const previous = state.current;
    if (previous && usable(previous)) return previous.accessToken;

    if (previous?.refreshToken) {
      const refreshAt = expiresAt(previous.refreshTokenExpiry);
      if (Number.isFinite(refreshAt) && refreshAt > now()) {
        try {
          const data = await deps.client.call({
            method: "POST",
            path: CJ_ENDPOINTS.refreshAccessToken,
            body: { refreshToken: previous.refreshToken },
          });
          return await remember(parseTokens(data, now()));
        } catch (e) {
          // Refresh rechazado: se cae a la API key. Otros fallos (red, límite) suben.
          if (!isSupplierError(e) || e.code !== "unauthorized") throw e;
        }
      }
    }

    const apiKey = await deps.getApiKey();
    if (!apiKey) throw new SupplierError("not_configured");
    const data = await deps.client.call({
      method: "POST",
      path: CJ_ENDPOINTS.getAccessToken,
      body: { apiKey },
    });
    return remember(parseTokens(data, now()));
  }

  return {
    async getToken() {
      const current = state.current;
      if (current && usable(current) && now() - state.loadedAt < RELOAD_EVERY_MS) return current.accessToken;
      state.inflight ??= renew().finally(() => {
        state.inflight = null;
      });
      return state.inflight;
    },

    invalidate(token) {
      state.rejected = token;
      if (state.current?.accessToken === token) state.loadedAt = 0;
    },
  };
}

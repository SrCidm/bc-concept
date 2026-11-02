import "server-only";
import { createSupabaseTokenStore, resolveApiKey, type TokenStore } from "../credentials";
import { SupplierError, isSupplierError } from "../errors";
import { list, rec, num } from "../raw";
import type { AuthResult, ListProductsParams, ProductPage, ShippingRoute, SupplierAdapter, SupplierProduct } from "../types";
import { createCjAuth, type CjAuthState } from "./auth";
import { createCjClient, isTokenRejected, type CjClientDeps, type CjRequest } from "./client";
import { CJ_ENDPOINTS, CJ_LISTED_WAREHOUSES } from "./endpoints";
import { mapCjListItem, mapCjProduct, parseCjRoutes } from "./mappers";

export interface CjDeps extends CjClientDeps {
  /** Por defecto: BD (supplier_credentials) y, si no hay, CJ_API_KEY. */
  getApiKey?: () => Promise<string | null>;
  tokenStore?: TokenStore;
  authState?: CjAuthState;
  listCacheTtlMs?: number;
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const LIST_CACHE_MAX = 50;
const FREIGHT_CACHE_TTL_MS = 60 * 60_000;
const FREIGHT_CACHE_MAX = 200;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export function createCjAdapter(deps: CjDeps = {}): SupplierAdapter {
  const now = deps.now ?? Date.now;
  const client = createCjClient(deps);
  const getApiKey = deps.getApiKey ?? (() => resolveApiKey("cj"));
  const auth = createCjAuth({
    client,
    getApiKey,
    store: deps.tokenStore ?? createSupabaseTokenStore("cj"),
    now: deps.now,
    state: deps.authState,
  });
  const ttl = deps.listCacheTtlMs ?? 60_000;
  /** Cada listado cuesta 50 puntos y ~2 s de cola: se reutiliza un minuto. */
  const listCache = new Map<string, { at: number; value: unknown }>();
  /** El modal recalcula al escribir el PVP: el flete no se vuelve a pedir en una hora. */
  const freightCache = new Map<string, { at: number; routes: ShippingRoute[] }>();

  /** Llamada autenticada. Si CJ rechaza el token, se renueva y se reintenta una vez. */
  async function api(req: Omit<CjRequest, "token">): Promise<unknown> {
    const token = await auth.getToken();
    try {
      return await client.call({ ...req, token });
    } catch (e) {
      if (!isTokenRejected(e)) throw e;
      auth.invalidate(token);
      return client.call({ ...req, token: await auth.getToken() });
    }
  }

  async function listRaw(query: Record<string, string | number>): Promise<unknown> {
    const key = JSON.stringify(query);
    const hit = listCache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value;
    const value = await api({ method: "GET", path: CJ_ENDPOINTS.products, query });
    if (listCache.size >= LIST_CACHE_MAX) listCache.clear();
    listCache.set(key, { at: now(), value });
    return value;
  }

  async function routesFrom(origin: string, destination: string, vid: string): Promise<ShippingRoute[]> {
    const key = `${origin}|${destination}|${vid}`;
    const hit = freightCache.get(key);
    if (hit && now() - hit.at < FREIGHT_CACHE_TTL_MS) return hit.routes;
    const data = await api({
      method: "POST",
      path: CJ_ENDPOINTS.freight,
      body: { startCountryCode: origin, endCountryCode: destination, products: [{ quantity: 1, vid }] },
    });
    const routes = parseCjRoutes(data, origin);
    if (freightCache.size >= FREIGHT_CACHE_MAX) freightCache.clear();
    freightCache.set(key, { at: now(), routes });
    return routes;
  }

  return {
    id: "cj",

    async auth(): Promise<AuthResult> {
      try {
        if (!(await getApiKey())) return { ok: false, code: "not_configured" };
        // No consume puntos.
        await api({ method: "GET", path: CJ_ENDPOINTS.warehouses });
        return { ok: true };
      } catch (e) {
        if (isSupplierError(e) && e.code === "not_configured") return { ok: false, code: "not_configured" };
        if (isSupplierError(e) && e.code === "unauthorized") return { ok: false, code: "unauthorized" };
        return { ok: false, code: "unreachable" };
      }
    },

    /**
     * Siempre solo UE (`euOnly` se ignora): un producto sin almacén UE explícito no
     * se lista. V1 no da cantidades; el filtro de país garantiza stock en ese almacén.
     */
    async listProducts(params: ListProductsParams = {}): Promise<ProductPage> {
      const page = Math.max(1, Math.floor(params.page ?? 1));
      const pageSize = clamp(Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
      const query: Record<string, string | number> = {
        pageNum: page,
        pageSize,
        countryCode: CJ_LISTED_WAREHOUSES[0],
      };
      const keyword = params.query?.trim();
      if (keyword) query.productNameEn = keyword;
      if (params.category && ID_PATTERN.test(params.category)) query.categoryId = params.category;

      const data = rec(await listRaw(query));
      if (!data || !Array.isArray(data.list)) throw new SupplierError("bad_response");
      const raw = list(data.list);
      const total = num(data.total);
      const items = raw.map(mapCjListItem).filter((p): p is SupplierProduct => p !== null);

      return {
        items,
        page,
        pageSize,
        hasMore: total !== null ? page * pageSize < total : raw.length >= pageSize,
        fetched: raw.length,
      };
    },

    async getProduct(id): Promise<SupplierProduct | null> {
      if (!ID_PATTERN.test(id)) throw new SupplierError("invalid_request");

      let detail: unknown;
      try {
        detail = await api({ method: "GET", path: CJ_ENDPOINTS.product, query: { pid: id } });
      } catch (e) {
        if (isSupplierError(e) && e.code === "not_found") return null;
        throw e;
      }
      if (!detail) return null;

      // Sin inventario no se inventa stock: el producto queda sin almacén UE.
      let inventory: unknown = null;
      try {
        inventory = await api({ method: "GET", path: CJ_ENDPOINTS.inventory, query: { pid: id } });
      } catch (e) {
        if (!isSupplierError(e) || e.code !== "not_found") throw e;
      }
      return mapCjProduct(detail, inventory);
    },

    /**
     * Ruta más barata desde el primer almacén UE con stock que llegue al destino.
     * Se prueba antes el del propio país: hoy DE→ES y FR→ES no tienen rutas, pero
     * si se abren se usarán sin cambiar nada. Se calcula con la variante más pesada
     * de ese almacén (peor caso), una sola llamada por almacén.
     */
    async getShippingRoute(product, destination) {
      const origins = product.stock.eu
        .filter((e): e is typeof e & { warehouse: string } => e.warehouse !== null && e.quantity > 0)
        .sort((a, b) => Number(b.warehouse === destination) - Number(a.warehouse === destination) || b.quantity - a.quantity);

      for (const { warehouse } of origins) {
        const candidates = product.variants.filter((v) => (v.euStockByWarehouse?.[warehouse] ?? 0) > 0);
        const heaviest = candidates.reduce<(typeof candidates)[number] | null>(
          (best, v) => (best === null || (v.weightKg ?? 0) > (best.weightKg ?? 0) ? v : best),
          null,
        );
        if (!heaviest) continue;
        const routes = await routesFrom(warehouse, destination, heaviest.supplierVariantId);
        if (routes.length > 0) return routes[0];
      }
      return null;
    },
  };
}

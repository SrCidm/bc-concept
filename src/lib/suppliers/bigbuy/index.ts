import "server-only";
import { resolveApiKey } from "../credentials";
import { SupplierError, isSupplierError } from "../errors";
import { supplierFetchJson, type HttpDeps } from "../http";
import type {
  AuthResult,
  ListProductsParams,
  ProductPage,
  SupplierAdapter,
  SupplierProduct,
} from "../types";
import { BIGBUY_DEFAULT_BASE, BIGBUY_ENDPOINTS, assertSafeBaseUrl } from "./endpoints";
import { mapProduct } from "./mappers";
import { indexById, listFrom, rec, text, type Rec } from "./raw";

export interface BigBuyDeps extends HttpDeps {
  /** Por defecto: BIGBUY_API_BASE o producción. Solo https (o localhost en tests). */
  baseUrl?: string;
  /** Por defecto: BD (supplier_credentials) y, si no hay, BIGBUY_API_KEY. */
  getApiKey?: () => Promise<string | null>;
  /** TTL de los bulk (info/imágenes/stock). Por defecto 10 min. */
  cacheTtlMs?: number;
  now?: () => number;
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/** Compara sin tildes ni mayúsculas (la búsqueda por texto es local). */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function createBigBuyAdapter(deps: BigBuyDeps = {}): SupplierAdapter {
  const baseUrl = assertSafeBaseUrl(
    deps.baseUrl ?? process.env.BIGBUY_API_BASE ?? BIGBUY_DEFAULT_BASE
  );
  const getApiKey = deps.getApiKey ?? (() => resolveApiKey("bigbuy"));
  const ttl = deps.cacheTtlMs ?? 10 * 60_000;
  const now = deps.now ?? Date.now;
  const http: HttpDeps = {
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
    timeoutMs: deps.timeoutMs,
    maxRetries: deps.maxRetries,
  };

  /** Caché por instancia para los bulk (no comparte nada entre procesos). */
  const bulkCache = new Map<string, { at: number; value: Map<string, Rec> }>();

  async function call(path: string, query?: Record<string, string | number>): Promise<unknown> {
    const apiKey = await getApiKey();
    if (!apiKey) throw new SupplierError("not_configured");
    const qs = query
      ? "?" + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
      : "";
    return supplierFetchJson(
      `${baseUrl}${path}${qs}`,
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
      http
    );
  }

  /** Opcional: si BigBuy responde 404 para una pieza auxiliar, seguimos sin ella. */
  async function optional(path: string, query?: Record<string, string | number>) {
    try {
      return await call(path, query);
    } catch (e) {
      if (isSupplierError(e) && e.code === "not_found") return null;
      throw e;
    }
  }

  async function bulk(
    name: string,
    path: string,
    wrapperKey: string,
    query: Record<string, string | number>
  ): Promise<Map<string, Rec>> {
    const cacheKey = `${name}|${JSON.stringify(query)}`;
    const hit = bulkCache.get(cacheKey);
    if (hit && now() - hit.at < ttl) return hit.value;
    const value = indexById(listFrom(await call(path, query), wrapperKey));
    bulkCache.set(cacheKey, { at: now(), value });
    return value;
  }

  return {
    id: "bigbuy",

    async auth(): Promise<AuthResult> {
      try {
        await call(BIGBUY_ENDPOINTS.probe, { isoCode: "es" });
        return { ok: true };
      } catch (e) {
        if (!isSupplierError(e)) return { ok: false, code: "unreachable" };
        if (e.code === "not_configured") return { ok: false, code: "not_configured" };
        if (e.code === "unauthorized") return { ok: false, code: "unauthorized" };
        return { ok: false, code: "unreachable" };
      }
    },

    async listProducts(params: ListProductsParams = {}): Promise<ProductPage> {
      const page = Math.max(1, Math.floor(params.page ?? 1));
      const pageSize = clamp(Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
      const lang = params.lang ?? "es";
      const euOnly = params.euOnly ?? true;
      const inStockOnly = params.inStockOnly ?? true;

      const query: Record<string, string | number> = { isoCode: lang, page, pageSize };
      if (params.category) query.parentTaxonomy = params.category;

      const rawProducts = listFrom(await call(BIGBUY_ENDPOINTS.products, query), "products");

      // Piezas auxiliares en bulk (con caché): una sola llamada por tipo, no N+1.
      const [info, images, stock] = await Promise.all([
        bulk("info", BIGBUY_ENDPOINTS.productsInformation, "products", { isoCode: lang }),
        bulk("images", BIGBUY_ENDPOINTS.productsImages, "images", {}),
        bulk("stock", BIGBUY_ENDPOINTS.productsStock, "stocks", {}),
      ]);

      const folded = params.query ? fold(params.query.trim()) : "";
      const items: SupplierProduct[] = [];
      for (const raw of rawProducts) {
        const id = text(rec(raw)?.id);
        const product = mapProduct({
          product: raw,
          info: id ? info.get(id) ?? null : null,
          images: id ? images.get(id) ?? null : null,
          stock: id ? stock.get(id) ?? null : null,
        });
        if (!product) continue;
        // euOnly cuenta solo existencias en almacén UE; inStockOnly exige > 0.
        const available = euOnly ? product.stock.euTotal : product.stock.total;
        if (inStockOnly && available <= 0) continue;
        if (euOnly && !inStockOnly && product.stock.eu.length === 0) continue;
        if (folded && !fold(`${product.title} ${product.sku ?? ""}`).includes(folded)) continue;
        items.push(product);
      }

      return {
        items,
        page,
        pageSize,
        hasMore: rawProducts.length >= pageSize,
        fetched: rawProducts.length,
      };
    },

    async getProduct(id, opts): Promise<SupplierProduct | null> {
      if (!ID_PATTERN.test(id)) throw new SupplierError("invalid_request");
      const lang = opts?.lang ?? "es";

      let product: unknown;
      try {
        product = await call(BIGBUY_ENDPOINTS.product(id), { isoCode: lang });
      } catch (e) {
        if (isSupplierError(e) && e.code === "not_found") return null;
        throw e;
      }

      // Secuencial a propósito: BigBuy limita la tasa de peticiones.
      const info = rec(await optional(BIGBUY_ENDPOINTS.productInformation(id), { isoCode: lang }));
      const images = await optional(BIGBUY_ENDPOINTS.productImages(id));
      const stock = await optional(BIGBUY_ENDPOINTS.productStock(id));
      const variations = await optional(BIGBUY_ENDPOINTS.productVariations(id));

      return mapProduct({
        // Algunas respuestas envuelven el objeto en { product } o en una lista.
        product: Array.isArray(product) ? product[0] : rec(product)?.product ?? product,
        info,
        images,
        stock,
        variations,
      });
    },
  };
}

import "server-only";
import {
  MOCK_IMAGES,
  MOCK_INFO,
  MOCK_PRODUCTS,
  MOCK_STOCK,
  mockVariations,
} from "./catalog";

/**
 * `fetch` falso que habla como la API de BigBuy (la forma SUPUESTA que ya usan
 * el adaptador y los fixtures). Se inyecta como `fetchImpl` del adaptador REAL:
 * por eso el mock ejercita mappers, filtro UE, reintentos y DTO, no solo la UI.
 */

export type MockFailure = "unauthorized" | "rate_limited" | "upstream";

export interface MockTransportOptions {
  /** Hace fallar TODAS las llamadas (para ver los estados de error del panel). */
  fail?: MockFailure | null;
  /** Latencia artificial (para ver el estado de carga). */
  latencyMs?: number;
  /** Key que el "proveedor" acepta. */
  apiKey?: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const byId = (list: Array<Record<string, unknown>>, id: string) =>
  list.find((x) => String(x.id) === id);

export function createMockBigBuyFetch(opts: MockTransportOptions = {}): typeof fetch {
  const apiKey = opts.apiKey ?? "mock-key";
  const latency = opts.latencyMs ?? 0;

  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));

    // `retry-after: 0` para que los reintentos del adaptador no retrasen el panel en desarrollo.
    if (opts.fail === "unauthorized") return json({}, 401);
    if (opts.fail === "rate_limited") return json({}, 429, { "retry-after": "0" });
    if (opts.fail === "upstream") return json({}, 500, { "retry-after": "0" });

    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${apiKey}`) return json({}, 401);

    const path = url.pathname;
    const q = url.searchParams;

    if (path === "/rest/catalog/taxonomies.json") return json([]);

    if (path === "/rest/catalog/products.json") {
      const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(q.get("pageSize") ?? 24) || 24));
      const taxonomy = q.get("parentTaxonomy");
      const all = taxonomy
        ? MOCK_PRODUCTS.filter((p) => String(p.taxonomy) === taxonomy)
        : MOCK_PRODUCTS;
      return json(all.slice((page - 1) * pageSize, page * pageSize));
    }
    if (path === "/rest/catalog/productsinformation.json") return json(MOCK_INFO);
    if (path === "/rest/catalog/productsimages.json") return json(MOCK_IMAGES);
    if (path === "/rest/catalog/productsstock.json") return json(MOCK_STOCK);

    const single = path.match(/^\/rest\/catalog\/(product|productinformation|productimages|productstock|productvariations)\/(\d+)\.json$/);
    if (single) {
      const [, kind, id] = single;
      const found =
        kind === "product" ? byId(MOCK_PRODUCTS, id)
        : kind === "productinformation" ? byId(MOCK_INFO, id)
        : kind === "productimages" ? byId(MOCK_IMAGES, id)
        : kind === "productstock" ? byId(MOCK_STOCK, id)
        : byId(MOCK_PRODUCTS, id) ? mockVariations(id) : undefined;
      return found ? json(found) : json({}, 404);
    }

    return json({}, 404);
  }) as typeof fetch;
}

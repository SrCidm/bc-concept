/**
 * Descubrimiento de la API de CJ en SOLO LECTURA (fase 0). No escribe en la BD ni
 * crea nada en CJ: el token solo vive en memoria. Regenera los fixtures de
 * `src/lib/suppliers/cj/__fixtures__/` con respuestas reales, recortadas y sin
 * datos sensibles. La API key y el token nunca se imprimen ni se guardan.
 *
 *   bun run scripts/cj-discover.ts <dirFixtures>
 *
 * Lo aprendido (ver CLAUDE.md): el catálogo UE sale de V1 (`/product/list`), no de
 * `listV2`; el stock por almacén solo viene en `getInventoryByPid`; y a 1 petición
 * cada 1,2 s CJ ya devuelve 1600200, así que se espera ~2 s tras cada respuesta.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const GAP_MS = 2200;
const SENSITIVE_KEYS = new Set(["accessToken", "refreshToken", "openId", "requestId", "supplierName", "supplierId", "pointsInfo", "contacts", "phone", "address1", "address2", "zipCode"]);

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
const dataOf = (j: unknown): Rec | null => (isRec(j) && isRec(j.data) ? j.data : null);

const dir = process.argv[2];
if (!dir) throw new Error("Uso: bun run scripts/cj-discover.ts <dirFixtures>");
mkdirSync(dir, { recursive: true });

const apiKey = process.env.CJ_API_KEY?.trim();
if (!apiKey) {
  console.log("CJ_API_KEY no está en el entorno (.env.local).");
  process.exit(1);
}

let token: string | null = null;
let calls = 0;

function scrub(text: string): string {
  const noKey = text.split(apiKey as string).join("[REDACTED_KEY]");
  return token ? noKey.split(token).join("[REDACTED_TOKEN]") : noKey;
}
const say = (line: string) => console.log(scrub(line));

async function request(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | number>; body?: unknown } = {}): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, GAP_MS));
    calls++;
    const qs = opts.query ? "?" + new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)])).toString() : "";
    const res = await fetch(`${BASE}${path}${qs}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { "CJ-Access-Token": token } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 429 || (isRec(json) && json.code === 1600200)) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    return json;
  }
  throw new Error("CJ sigue limitando las peticiones");
}

/** Recorta listas, acorta textos y quita claves sensibles. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 3).map(redact);
  if (isRec(value)) {
    const out: Rec = {};
    for (const [k, v] of Object.entries(value)) if (!SENSITIVE_KEYS.has(k)) out[k] = redact(v);
    return out;
  }
  return typeof value === "string" && value.length > 1500 ? value.slice(0, 1500) + "…" : value;
}

function fixture(name: string, json: unknown) {
  writeFileSync(join(dir, `${name}.json`), scrub(JSON.stringify(redact(json), null, 2)) + "\n");
}

function routesLine(json: unknown): string {
  const routes = isRec(json) ? list(json.data) : [];
  if (!routes.length) return `sin rutas (code ${isRec(json) ? String(json.code) : "?"})`;
  return routes.slice(0, 3).map((r) => `${String(r.logisticName)} ${String(r.logisticPrice)} USD ${String(r.logisticAging)} d`).join(" · ");
}

async function main() {
  const auth = await request("POST", "/authentication/getAccessToken", { body: { apiKey } });
  const authData = dataOf(auth);
  if (!authData || typeof authData.accessToken !== "string") {
    say(`Sin token (code ${isRec(auth) ? String(auth.code) : "?"})`);
    process.exit(1);
  }
  token = authData.accessToken;

  const warehouses = await request("GET", "/product/globalWarehouseList");
  fixture("warehouses", warehouses);

  // listV2 con filtro de país: se conserva para documentar que devuelve muy poco.
  const v2 = await request("GET", "/product/listV2", { query: { page: 1, size: 5, countryCode: "ES" } });
  fixture("list-v2-es", v2);
  say(`listV2 ES: totalRecords=${String(dataOf(v2)?.totalRecords)}`);

  // Catálogo UE real: V1.
  const v1Es = await request("GET", "/product/list", { query: { pageNum: 1, pageSize: 5, countryCode: "ES", productNameEn: "vase" } });
  fixture("list-v1-es-vase", v1Es);
  say(`V1 ES "vase": total=${String(dataOf(v1Es)?.total)}`);
  const product = list(dataOf(v1Es)?.list)[0];
  if (!product) throw new Error("V1 no devolvió productos");
  const pid = String(product.pid);

  const detail = await request("GET", "/product/query", { query: { pid } });
  fixture("product-es", detail);
  const inventory = await request("GET", "/product/stock/getInventoryByPid", { query: { pid } });
  fixture("inventory-es", inventory);

  const vid = list(dataOf(detail)?.variants)[0]?.vid;
  const freightEs = await request("POST", "/logistic/freightCalculate", { body: { startCountryCode: "ES", endCountryCode: "ES", products: [{ quantity: 1, vid }] } });
  fixture("freight-es-es", freightEs);
  say(`Flete ES→ES ${String(product.productNameEn).slice(0, 40)}: ${routesLine(freightEs)}`);

  // Decoración en Alemania: ¿llega a España?
  const v1De = await request("GET", "/product/list", { query: { pageNum: 1, pageSize: 4, countryCode: "DE", productNameEn: "lamp" } });
  fixture("list-v1-de-lamp", v1De);
  let savedEmpty = false;
  for (const p of list(dataOf(v1De)?.list).slice(0, 4)) {
    const d = await request("GET", "/product/query", { query: { pid: String(p.pid) } });
    const v = list(dataOf(d)?.variants)[0];
    if (!v) continue;
    const f = await request("POST", "/logistic/freightCalculate", { body: { startCountryCode: "DE", endCountryCode: "ES", products: [{ quantity: 1, vid: v.vid }] } });
    say(`Flete DE→ES ${String(p.productNameEn).slice(0, 40)} (${String(v.variantWeight)} g): ${routesLine(f)}`);
    const empty = isRec(f) && list(f.data).length === 0;
    if (empty && !savedEmpty) {
      fixture("freight-de-es-sin-rutas", f);
      savedEmpty = true;
    }
    if (!empty) fixture("freight-de-es", f);
  }

  say(`Llamadas: ${calls}`);
}

main().catch((e: unknown) => {
  say(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
  process.exit(1);
});

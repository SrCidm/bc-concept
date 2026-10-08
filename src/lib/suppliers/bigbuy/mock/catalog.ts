import "server-only";

/**
 * Catálogo SIMULADO de BigBuy para desarrollar el panel sin API key.
 *
 * Tiene la MISMA forma cruda que los fixtures de `__fixtures__/bigbuy.ts` (que
 * a su vez es la forma SUPUESTA de la API real): pasa por el adaptador real, por
 * sus mappers, el filtro UE y el DTO. Es determinista (misma semilla → mismo
 * catálogo) y mezcla a propósito los casos que el panel debe saber pintar:
 * stock UE, solo fuera de la UE, sin stock, almacén desconocido, varios
 * almacenes, un producto sin imagen y dos sin precio mayorista (el mapper los
 * descarta, así que `fetched` > nº de resultados).
 *
 * Solo se importa desde `registry.ts` (un test lo vigila) y nunca en producción.
 */

/** PRNG determinista (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = [
  { name: "Lámpara de mesa", taxonomy: 2501, base: 22 },
  { name: "Lámpara de pie", taxonomy: 2501, base: 48 },
  { name: "Aplique de pared", taxonomy: 2501, base: 19 },
  { name: "Lámpara colgante", taxonomy: 2501, base: 34 },
  { name: "Cojín", taxonomy: 2502, base: 7 },
  { name: "Manta", taxonomy: 2502, base: 16 },
  { name: "Plaid", taxonomy: 2502, base: 24 },
  { name: "Alfombra", taxonomy: 2502, base: 55 },
  { name: "Jarrón", taxonomy: 2503, base: 9 },
  { name: "Espejo redondo", taxonomy: 2503, base: 32 },
  { name: "Cesta", taxonomy: 2503, base: 11 },
  { name: "Bandeja", taxonomy: 2503, base: 8 },
  { name: "Reloj de pared", taxonomy: 2503, base: 21 },
  { name: "Macetero", taxonomy: 2503, base: 6 },
  { name: "Portavelas", taxonomy: 2503, base: 5 },
  { name: "Marco de fotos", taxonomy: 2503, base: 6 },
] as const;

const MATERIALS = [
  "de cerámica mate",
  "de lino lavado",
  "de roble natural",
  "de latón envejecido",
  "de ratán",
  "de algodón orgánico",
  "de vidrio soplado",
  "de terracota",
  "de mármol blanco",
] as const;

const EU_WAREHOUSES = ["ES", "ES", "ES", "DE", "PT", "FR", "PL"] as const;

export const MOCK_PRODUCT_COUNT = 48;
/** Índices sin precio mayorista (el mapper los descarta). */
const NO_PRICE = new Set([17, 41]);
/** Producto sin imágenes (para ver el fallback tonal). */
const NO_IMAGE = new Set([5, 30]);

interface Rec {
  [k: string]: unknown;
}

const random = rng(20261008);
const round2 = (n: number) => Math.round(n * 100) / 100;
const between = (lo: number, hi: number) => lo + random() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

function build() {
  const products: Rec[] = [];
  const info: Rec[] = [];
  const images: Rec[] = [];
  const stock: Rec[] = [];
  const used = new Set<string>();

  for (let i = 0; i < MOCK_PRODUCT_COUNT; i++) {
    const kind = KINDS[i % KINDS.length];
    let m = (i * 3 + Math.floor(i / KINDS.length)) % MATERIALS.length;
    let name = `${kind.name} ${MATERIALS[m]}`;
    while (used.has(name)) {
      m = (m + 1) % MATERIALS.length;
      name = `${kind.name} ${MATERIALS[m]}`;
    }
    used.add(name);

    const id = 20001 + i;
    const cost = round2(Math.min(95, Math.max(3.5, kind.base * between(0.7, 1.6))));
    const retail = round2(Math.floor(cost * between(2.2, 3.4)) + 0.9);

    const product: Rec = {
      id,
      sku: `BB${id}`,
      ean13: `84${String(id).padStart(11, "0")}`,
      weight: round2(between(0.2, 6)),
      wholesalePrice: cost,
      retailPrice: retail,
      taxonomy: kind.taxonomy,
    };
    if (NO_PRICE.has(i)) delete product.wholesalePrice;
    products.push(product);

    info.push({
      id,
      name,
      description: `<p>${kind.name} ${MATERIALS[m]}. Producto de ejemplo para el panel de importación.</p>`,
    });

    images.push({
      id,
      images: NO_IMAGE.has(i) ? [] : [{ url: `/admin-mock/p${(i % 8) + 1}.svg` }],
    });

    // Escenario de stock: las primeras tarjetas son "bonitas" para la primera vista.
    const r = i < 8 ? 0.1 : random();
    const handling = () => {
      const min = int(1, 3);
      return { minHandlingDays: min, maxHandlingDays: min + int(1, 3) };
    };
    let stocks: Rec[];
    if (i === 3) {
      stocks = [{ quantity: 0, ...handling(), warehouse: "ES" }]; // EU sin stock, visible en la 1.ª página
    } else if (i === 6) {
      stocks = [{ quantity: 24, minHandlingDays: 6, maxHandlingDays: 9, warehouse: "CN" }]; // solo fuera de la UE, visible en la 1.ª página
    } else if (r < 0.7) {
      const wh = EU_WAREHOUSES[int(0, EU_WAREHOUSES.length - 1)];
      stocks = [{ quantity: int(3, 120), ...handling(), warehouse: wh }];
    } else if (r < 0.78) {
      stocks = [{ quantity: int(5, 60), minHandlingDays: int(5, 7), maxHandlingDays: int(8, 12), warehouse: random() < 0.5 ? "CN" : "US" }];
    } else if (r < 0.86) {
      stocks = [{ quantity: 0, ...handling(), warehouse: "DE" }];
    } else if (r < 0.92) {
      stocks = [{ quantity: int(2, 30), ...handling() }]; // almacén sin informar
    } else {
      stocks = [
        { quantity: int(2, 20), ...handling(), warehouse: "ES" },
        { quantity: int(10, 80), minHandlingDays: 6, maxHandlingDays: 10, warehouse: "CN" },
      ];
    }
    stock.push({ id, stocks });
  }

  return { products, info, images, stock };
}

const built = build();
export const MOCK_PRODUCTS = built.products;
export const MOCK_INFO = built.info;
export const MOCK_IMAGES = built.images;
export const MOCK_STOCK = built.stock;

/** Dos variantes de ejemplo por producto (para getProduct). */
export function mockVariations(id: string): Rec[] {
  const product = MOCK_PRODUCTS.find((p) => String(p.id) === id);
  const cost = typeof product?.wholesalePrice === "number" ? product.wholesalePrice : 10;
  const retail = typeof product?.retailPrice === "number" ? product.retailPrice : 30;
  return [
    { id: Number(id) * 10 + 1, sku: `BB${id}-A`, wholesalePrice: cost, retailPrice: retail, stock: 12, attributes: [{ name: "Acabado", value: "Natural" }] },
    { id: Number(id) * 10 + 2, sku: `BB${id}-B`, wholesalePrice: round2(cost * 1.08), retailPrice: round2(retail * 1.08), stock: 7, attributes: [{ name: "Acabado", value: "Blanco" }] },
  ];
}

/**
 * ⚠️ FIXTURES CON FORMA SUPUESTA. Reproducen lo que creemos que devuelve la API
 * de BigBuy; NO son capturas reales. Cuando llegue BIGBUY_API_KEY y se vea la
 * respuesta del sandbox, hay que contrastarlas y corregir mappers + fixtures.
 */

export const PRODUCTS = [
  { id: 1001, sku: "S1001", ean13: "8400000000011", weight: 1.2, wholesalePrice: 18.5, retailPrice: 59.9, taxonomy: 2501 },
  { id: 1002, sku: "S1002", ean13: "8400000000028", weight: 0.4, wholesalePrice: 6.2, retailPrice: 19.9, taxonomy: 2501 },
  { id: 1003, sku: "S1003", ean13: "8400000000035", weight: 2.0, wholesalePrice: 9.0, retailPrice: 34.0, taxonomy: 2502 },
  // Sin precio mayorista: no se puede evaluar → se descarta.
  { id: 1004, sku: "S1004", weight: 1.0, retailPrice: 10 },
  { id: 1005, sku: "S1005", ean13: "8400000000059", weight: 0.9, wholesalePrice: 12, retailPrice: 41, taxonomy: 2502 },
];

export const INFO = [
  { id: 1001, name: "Lámpara de mesa cerámica", description: "<p>Lámpara artesanal</p>" },
  { id: 1002, name: "Cojín de lino", description: "Cojín" },
  { id: 1003, name: "Jarrón de cristal", description: "Jarrón" },
  { id: 1005, name: "Espejo redondo", description: "Espejo" },
];

export const IMAGES = [
  { id: 1001, images: [{ url: "https://cdn.example.test/1001-a.jpg" }, { url: "https://cdn.example.test/1001-a.jpg" }, { url: "http://insecure.example.test/1001-b.jpg" }] },
  { id: 1002, images: [{ url: "https://cdn.example.test/1002.jpg" }] },
];

export const STOCK = [
  // UE (ES) con existencias.
  { id: 1001, stocks: [{ quantity: 25, minHandlingDays: 1, maxHandlingDays: 2, warehouse: "ES" }] },
  // Solo fuera de la UE.
  { id: 1002, stocks: [{ quantity: 9, minHandlingDays: 5, maxHandlingDays: 9, warehouse: "US" }] },
  // UE sin existencias.
  { id: 1003, stocks: [{ quantity: 0, minHandlingDays: 1, maxHandlingDays: 3, warehouse: "DE" }] },
  // Almacén sin informar → se asume UE.
  { id: 1005, stocks: [{ quantity: 4, minHandlingDays: 2, maxHandlingDays: 4 }] },
];

export const VARIATIONS = [
  { id: 5001, sku: "S1001-W", wholesalePrice: 18.5, retailPrice: 59.9, stocks: [{ quantity: 10, warehouse: "ES" }], attributes: [{ name: "Color", value: "Blanco" }] },
  { id: 5002, sku: "S1001-B", wholesalePrice: 19.5, retailPrice: 62.9, stock: 15, attributes: { Color: "Negro" } },
];

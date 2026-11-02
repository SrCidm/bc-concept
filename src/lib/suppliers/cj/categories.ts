import "server-only";

/**
 * Categorías de CJ que encajan con la tienda: hogar, decoración, iluminación y
 * textiles. Son hojas del árbol de `/product/getCategory`, porque el listado V1
 * solo trae la hoja de cada producto (`categoryId`).
 *
 * Revisado el 2026-11-02 con el almacén ES: 1.956 productos, 1.259 en estas
 * hojas. Fuera quedan cocina (utensilios, menaje de conservación, cuchillería),
 * electrodomésticos, fiesta (confeti, globos), papelería, mascotas, electrónica,
 * belleza y deporte. La clasificación de CJ es aproximada (hay piezas mal
 * clasificadas en ambos sentidos): esto acota el listado, no sustituye la
 * curaduría. Entre paréntesis, productos del almacén ES ese día.
 */
export const CJ_CURATED_CATEGORIES = [
  // Decoración (Home, Garden & Furniture)
  { id: "2410301014451618100", name: "Home Storage / Furniture" }, // (393) marcos, jarrones, espejos
  { id: "7B975B46-46DF-4C3A-BC58-1F4F2DDB9413", name: "Festive & Party / Decorative Flowers & Wreaths" }, // (65) macetas, plantas
  { id: "1711658677159079936", name: "Home Storage / Seasonal products" }, // (65) velas, mikados, incienso
  { id: "621F9C38-814C-40C2-9F9D-7CE12DB8FB4C", name: "Festive & Party / Christmas Decoration Supplies" }, // (48)
  { id: "2409230854411618700", name: "Arts, Crafts & Sewing / Decor Paintings" }, // (22) cuadros, láminas
  // Hogar: mesa y orden
  { id: "CF330457-0E5B-4FAF-9BAE-7D2C247BD8DE", name: "Kitchen, Dining & Bar / Drinkware" }, // (122) jarras, tazas, portavelas
  { id: "0F4CFA22-8B97-4016-94A6-18066B9BD05C", name: "Kitchen, Dining & Bar / Dinnerware" }, // (109) vajilla, bandejas
  { id: "2502140315331600200", name: "Home Storage / Storage Bags & Cases & Boxes" }, // (189) cestas, organizadores
  { id: "B62EE40F-7650-4715-A7A5-BA227540593C", name: "Home Storage / Bathroom Storage" }, // (63)
  { id: "A0E89009-FFD6-4B2E-906A-8076DF45B32C", name: "Home Storage / Clothing & Wardrobe Storage" }, // (38) percheros
  // Iluminación (Home Improvement)
  { id: "0591D043-4EFC-494A-9901-358197CC3D18", name: "Indoor Lighting / Pendant Lights" }, // (42)
  { id: "D6A70719-5E93-40E6-AE8B-A060D667A17B", name: "Indoor Lighting / Ceiling Lights" }, // (6)
  { id: "DFFFDEDF-42F8-4D1F-B0A3-6B6744F7C1D3", name: "LED Lighting / LED Spotlights" }, // (11)
  { id: "F9749558-9C47-4612-9411-88FF301DB7AD", name: "Outdoor Lighting / Solar Lamps" }, // (12)
  { id: "EDB5F43E-EAC0-489A-8355-5188EAB72D08", name: "Outdoor Lighting / String Lights" }, // (5)
  // Textiles (Home, Garden & Furniture / Home Textiles)
  { id: "2601070550351602500", name: "Home Textiles / Floor Mats" }, // (20) alfombras, felpudos
  { id: "1A9A9965-A914-46D7-B8E2-49AD256F2B6B", name: "Home Textiles / Curtains" }, // (16)
  { id: "6939DA08-F7F8-48FB-A7E8-169AEAC92404", name: "Home Textiles / Pillows" }, // (15) cojines
  { id: "36F37524-3EAF-4E20-B989-10137FD0ED70", name: "Home Textiles / Comforters" }, // (6)
  { id: "496E6FFC-4BC4-4CA6-8225-5BC0D56E8E11", name: "Home Textiles / Bedding Sets" }, // (5)
  { id: "300CC260-CF9D-4AEA-9FC2-6C8DB8A35B51", name: "Home Textiles / Cushion Covers" }, // (5)
  { id: "331F43CE-CA1D-45F2-BE2A-8AE62EC10251", name: "Home Textiles / Towels" }, // (2)
] as const;

export const CJ_CURATED_IDS: ReadonlySet<string> = new Set(CJ_CURATED_CATEGORIES.map((c) => c.id));

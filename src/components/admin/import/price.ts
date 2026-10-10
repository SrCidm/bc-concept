/**
 * Entrada de precio del modal: acepta coma o punto decimal ("59,90" / "59.9"),
 * como mucho 2 decimales. Solo filtra lo evidentemente inválido para no pedir
 * al servidor cálculos absurdos: la validación de verdad (rango, decimales) es
 * del servidor. NO calcula nada de margen.
 */
export function parsePriceInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0.01 ? n : null;
}

/** 59.9 → "59,90" (para rellenar el campo). */
export function formatPriceInput(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

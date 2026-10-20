import { MARGIN_RANGES, type MarginField } from "@/lib/admin/settings.types";

/**
 * Entrada y formato de los ajustes de margen (solo presentación; la validación
 * de verdad es del servidor). Coma o punto decimal, máx. 2 decimales.
 */
export function parseDecimalInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const euroInput = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const pctInput = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

/** Valor → texto del campo ("4,50" para €, "6" o "1,5" para %). */
export function formatDecimalInput(field: MarginField, n: number): string {
  return MARGIN_RANGES[field].unit === "€" ? euroInput.format(n) : pctInput.format(n);
}

/** Valor con su unidad, para resúmenes e historial ("15 %", "4,50 €"). */
export function formatFieldValue(field: MarginField, n: number): string {
  return `${formatDecimalInput(field, n)} ${MARGIN_RANGES[field].unit}`;
}

/** ¿Dentro del rango? (aviso inmediato en el campo; el servidor vuelve a validar). */
export function inRange(field: MarginField, n: number): boolean {
  const r = MARGIN_RANGES[field];
  return n >= r.min && n <= r.max;
}

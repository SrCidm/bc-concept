import { formatMoney, formatMoneyRange } from "./format";

/** Lo que hace falta para decidir cómo se enseña el coste (viene del servidor: `ImportPreviewDTO.product`). */
export interface CostFields {
  cost: { amount: number; currency: string };
  minCost: number;
  worstCaseCost: number;
  costVaries: boolean;
}

/**
 * Cabecera "Coste de proveedor". Con variantes de coste distinto se muestra el
 * RANGO (34,03–36,75 €) para que el coste del desglose (el de la variante más
 * cara) no parezca un error; si todas cuestan lo mismo, un único importe.
 */
export function costHeaderText(p: CostFields): string {
  return p.costVaries
    ? formatMoneyRange(p.minCost, p.worstCaseCost, p.cost.currency)
    : formatMoney(p.cost);
}

/** Clave del texto de la fila de coste del desglose (messages: admin.import.dialog.margin.rows.*). */
export function costRowLabelKey(costVaries: boolean): "cost" | "costWorst" {
  return costVaries ? "costWorst" : "cost";
}

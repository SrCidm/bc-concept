/** Formato de datos del panel (modo Operate: cifras alineadas, es-ES). */

const moneyFormats = new Map<string, Intl.NumberFormat>();

export function formatMoney(m: { amount: number; currency: string }): string {
  let f = moneyFormats.get(m.currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("es-ES", { style: "currency", currency: m.currency });
    } catch {
      // Código de moneda no válido: se muestra el número con su código.
      return `${m.amount.toFixed(2)} ${m.currency}`;
    }
    moneyFormats.set(m.currency, f);
  }
  return f.format(m.amount);
}

const plainFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "34,03–36,75 €": el símbolo solo al final. */
export function formatMoneyRange(min: number, max: number, currency: string): string {
  try {
    new Intl.NumberFormat("es-ES", { style: "currency", currency });
  } catch {
    // Código de moneda no válido: mismo criterio que formatMoney (números con su código).
    return `${min.toFixed(2)}–${max.toFixed(2)} ${currency}`;
  }
  return `${plainFormat.format(min)}–${formatMoney({ amount: max, currency })}`;
}

const intFormat = new Intl.NumberFormat("es-ES");
export const formatInt = (n: number) => intFormat.format(n);

/** Fechas del panel de productos (es-ES, hora de Madrid). */
const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });
const dateOnly = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" });

const safe = (f: Intl.DateTimeFormat, iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : f.format(d);
};

export const formatWhen = (iso: string) => safe(dateTime, iso);
export const formatDay = (iso: string) => safe(dateOnly, iso);

const pctFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct = (n: number) => pctFormat.format(n);

import "server-only";
import { MARGIN_FIELDS, MARGIN_NOTE_MAX, MARGIN_RANGES, type MarginField, type MarginValuesDTO } from "@/lib/admin/settings.types";

/**
 * Validación de los ajustes de margen. Rangos cerrados (MARGIN_RANGES), máx. 2
 * decimales y objetivo ≥ mínimo. Fuera de rango → la lista de CAMPOS erróneos,
 * nunca los valores recibidos (sin eco). Se usa para la entrada del cliente y
 * para las filas leídas de la BD (una fila corrupta se trata como fallo).
 */

export type MarginValuesResult = { ok: true; values: MarginValuesDTO } | { ok: false; fields: MarginField[] };

export type MarginInputResult =
  | { ok: true; values: MarginValuesDTO; note: string | null }
  | { ok: false; fields: Array<MarginField | "note" | "body"> };

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

function toNumber(v: unknown, allowNumericStrings: boolean): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (allowNumericStrings && typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

export function parseMarginSettingsValues(
  raw: unknown,
  opts: { allowNumericStrings?: boolean } = {}
): MarginValuesResult {
  const o = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const values = {} as MarginValuesDTO;
  const bad: MarginField[] = [];

  for (const field of MARGIN_FIELDS) {
    const n = toNumber(o[field], opts.allowNumericStrings ?? false);
    const r = MARGIN_RANGES[field];
    if (n === null || n < r.min || n > r.max || !twoDecimals(n)) {
      bad.push(field);
      continue;
    }
    values[field] = Math.round(n * 100) / 100;
  }
  if (!bad.includes("targetMinPct") && !bad.includes("targetMaxPct") && values.targetMaxPct < values.targetMinPct) {
    bad.push("targetMaxPct");
  }
  return bad.length ? { ok: false, fields: MARGIN_FIELDS.filter((f) => bad.includes(f)) } : { ok: true, values };
}

/** Entrada del formulario: solo números (el cliente ya convierte "4,50" → 4.5), más una nota opcional. */
export function parseMarginSettingsInput(raw: unknown): MarginInputResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, fields: ["body"] };
  const o = raw as Record<string, unknown>;

  const v = parseMarginSettingsValues(o);
  const fields: Array<MarginField | "note"> = v.ok ? [] : [...v.fields];

  let note: string | null = null;
  if (o.note !== undefined && o.note !== null) {
    // eslint-disable-next-line no-control-regex
    if (typeof o.note !== "string" || o.note.length > MARGIN_NOTE_MAX || /[\u0000-\u001f\u007f]/.test(o.note)) {
      fields.push("note");
    } else {
      const trimmed = o.note.trim();
      note = trimmed === "" ? null : trimmed;
    }
  }

  if (fields.length || !v.ok) return { ok: false, fields };
  return { ok: true, values: v.values, note };
}

import "server-only";
import { resolveAdmin, type AdminDecision } from "@/lib/auth/requireAdmin";
import { minimumPrice } from "@/lib/pricing/guard";
import { computeMargin, type MarginParams } from "@/lib/pricing/margin";
import {
  VAT_PCT,
  marginSettings,
  marginParamsFromEnv,
  marginSettingsStorage,
  marginSettingsStore,
  toMarginParams,
  toMarginValues,
  type DbMarginSource,
} from "@/lib/pricing/settings";
import { parseMarginSettingsInput, parseMarginSettingsValues } from "@/lib/pricing/settingsInput";
import type { MarginSettingsStore } from "@/lib/pricing/settingsStore";
import {
  EXAMPLE_COST,
  MARGIN_FIELDS,
  type MarginExampleDTO,
  type MarginField,
  type MarginHistoryEntryDTO,
  type MarginSettingsErrorCode,
  type MarginSettingsPanelDTO,
} from "./settings.types";

/**
 * Ajustes de margen del panel (/admin/ajustes). AUTO-GUARDADAS, como
 * `importProduct`: la sesión de admin se comprueba aquí antes de leer o
 * escribir nada; no se confía en la ruta ni en el layout.
 *
 * · Guardar = INSERTAR una fila nueva (nunca actualizar ni borrar); `created_by`
 *   es el email de la sesión, nunca un dato del cliente.
 * · Tras guardar se invalida la caché de la fuente: el siguiente preview del
 *   modal de importación ya usa los valores nuevos.
 * · Errores: solo códigos (+ nombres de campos en validación), sin eco ni
 *   detalles de la BD.
 */

export interface MarginSettingsDeps {
  resolve?: () => Promise<AdminDecision>;
  store?: MarginSettingsStore;
  source?: DbMarginSource;
  /** Para tests: dónde dice el panel que se guarda. */
  storage?: "db" | "memory";
}

type Fail = { ok: false; code: MarginSettingsErrorCode; fields?: Array<MarginField | "note" | "body"> };
export type PanelResult = { ok: true; data: MarginSettingsPanelDTO } | Fail;
export type ExampleResult = { ok: true; data: MarginExampleDTO } | Fail;

const HISTORY_LIMIT = 10;

async function authorize(deps: MarginSettingsDeps): Promise<{ ok: true; email: string } | Fail> {
  let decision: AdminDecision;
  try {
    decision = await (deps.resolve ?? resolveAdmin)();
  } catch {
    return { ok: false, code: "unauthenticated" };
  }
  return decision.ok ? { ok: true, email: decision.email } : { ok: false, code: decision.code };
}

/** "Con un coste de 20 € y estos ajustes, el PVP mínimo es X €" + desglose a ese precio. */
export function buildExample(params: MarginParams): MarginExampleDTO {
  const minPrice = minimumPrice(EXAMPLE_COST, params);
  const m = minPrice === null ? null : computeMargin(EXAMPLE_COST, minPrice, params);
  return {
    cost: EXAMPLE_COST,
    minPrice,
    breakdown: m
      ? {
          price: m.price,
          vat: m.vat,
          netRevenue: m.netRevenue,
          cost: m.cost,
          shipping: m.shipping,
          stripeFee: m.stripeFee,
          returnsBuffer: m.returnsBuffer,
          acquisition: m.acquisition,
          netMargin: m.netMargin,
          netMarginPct: m.netMarginPct,
        }
      : null,
  };
}

async function buildPanel(deps: MarginSettingsDeps): Promise<MarginSettingsPanelDTO> {
  const source = deps.source ?? marginSettings();
  const store = deps.store ?? marginSettingsStore();
  const resolved = await source.resolve();

  let degraded = resolved.degraded;
  let history: MarginHistoryEntryDTO[] = [];
  try {
    const rows = await store.history(HISTORY_LIMIT + 1); // +1 para saber qué cambió en la más antigua mostrada
    const valid = rows.flatMap((r) => {
      const v = parseMarginSettingsValues(r.values, { allowNumericStrings: true });
      return v.ok ? [{ r, values: v.values }] : [];
    });
    // El guardado más antiguo de todos (no hay fila anterior) se compara con lo que
    // regía antes de guardar nada: entorno/valores por defecto.
    const beforeFirst = rows.length <= HISTORY_LIMIT ? toMarginValues(marginParamsFromEnv()) : undefined;
    history = valid.slice(0, HISTORY_LIMIT).map(({ r, values }, i) => {
      const prev = valid[i + 1]?.values ?? (i === valid.length - 1 ? beforeFirst : undefined);
      return {
        id: r.id,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        note: r.note,
        values,
        changed: prev ? MARGIN_FIELDS.filter((f) => prev[f] !== values[f]) : [],
      };
    });
  } catch {
    degraded = true;
  }

  return {
    vatPct: VAT_PCT,
    values: toMarginValues(resolved.params),
    origin: resolved.origin,
    degraded,
    storage: deps.storage ?? marginSettingsStorage(),
    savedBy: resolved.record?.createdBy ?? null,
    savedAt: resolved.record?.createdAt ?? null,
    note: resolved.record?.note ?? null,
    history,
    example: buildExample(resolved.params),
  };
}

export async function getMarginSettingsPanel(deps: MarginSettingsDeps = {}): Promise<PanelResult> {
  const auth = await authorize(deps);
  if (!auth.ok) return auth;
  return { ok: true, data: await buildPanel(deps) };
}

/** Ejemplo en vivo con los valores del formulario (sin guardar). */
export async function previewMarginSettings(rawInput: unknown, deps: MarginSettingsDeps = {}): Promise<ExampleResult> {
  const auth = await authorize(deps);
  if (!auth.ok) return auth;
  const input = parseMarginSettingsInput(rawInput);
  if (!input.ok) return { ok: false, code: "invalid_request", fields: input.fields };
  return { ok: true, data: buildExample(toMarginParams(input.values)) };
}

export async function saveMarginSettings(rawInput: unknown, deps: MarginSettingsDeps = {}): Promise<PanelResult> {
  const auth = await authorize(deps);
  if (!auth.ok) return auth;
  const input = parseMarginSettingsInput(rawInput);
  if (!input.ok) return { ok: false, code: "invalid_request", fields: input.fields };

  const store = deps.store ?? marginSettingsStore();
  try {
    // Solo inserción: cada guardado es una fila nueva.
    await store.insert({ values: input.values, createdBy: auth.email, note: input.note });
  } catch {
    return { ok: false, code: "storage_failed" };
  }
  (deps.source ?? marginSettings()).invalidate();
  return { ok: true, data: await buildPanel(deps) };
}

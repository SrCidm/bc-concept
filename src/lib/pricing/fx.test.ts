import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FX_URL, createFxSource, parseFrankfurter, usdToEur, usdToEurCost } from "./fx";
import type { FxStore, StoredFxRate } from "./fxStore";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** Respuesta real de Frankfurter. */
const REAL = { amount: 1.0, base: "USD", date: "2026-10-30", rates: { EUR: 0.89509 } };

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(opts: { stored?: StoredFxRate | null; fetch?: () => Response | Promise<Response>; readFails?: boolean; writeFails?: boolean } = {}) {
  let t = NOW;
  const inserted: { rate: number; rateDate: string }[] = [];
  let fetches = 0;
  const store: FxStore = {
    latest: async () => {
      if (opts.readFails) throw new Error("bd caída");
      return opts.stored ?? null;
    },
    insert: async (r) => {
      if (opts.writeFails) throw new Error("bd caída");
      inserted.push(r);
    },
  };
  const source = createFxSource({
    store,
    now: () => t,
    fetchImpl: (async (url: string | URL | Request) => {
      expect(String(url)).toBe(FX_URL);
      fetches++;
      return opts.fetch ? opts.fetch() : res(REAL);
    }) as typeof fetch,
  });
  return { source, inserted, fetches: () => fetches, advance: (ms: number) => (t += ms) };
}
const stored = (rateDate: string, fetchedAgoMs: number, rate = 0.9): StoredFxRate => ({ rate, rateDate, fetchedAt: new Date(NOW - fetchedAgoMs).toISOString() });

describe("conversión", () => {
  test("coste = USD × tipo × (1 + colchón), al céntimo", () => {
    expect(usdToEurCost(7.28, 0.89509, 3)).toBe(6.71);
    expect(usdToEurCost(100, 0.9, 0)).toBe(90);
    expect(usdToEurCost(100, 0.9, 10)).toBe(99);
  });
  test("referencia: sin colchón", () => {
    expect(usdToEur(50.09, 0.89509)).toBe(44.84);
  });
});

describe("parseFrankfurter", () => {
  test("respuesta real", () => {
    expect(parseFrankfurter(REAL)).toEqual({ rate: 0.89509, rateDate: "2026-10-30" });
  });
  test("cualquier cosa rara → null (nunca un tipo dudoso)", () => {
    for (const bad of [
      null,
      "x",
      {},
      { ...REAL, base: "EUR" },
      { ...REAL, date: "ayer" },
      { ...REAL, date: "2026-13-45" },
      { ...REAL, rates: {} },
      { ...REAL, rates: { EUR: "0.9" } },
      { ...REAL, rates: { EUR: 0 } },
      { ...REAL, rates: { EUR: -1 } },
      { ...REAL, rates: { EUR: 89.5 } },
      { ...REAL, rates: { EUR: Number.NaN } },
    ]) {
      expect(parseFrankfurter(bad)).toBeNull();
    }
  });
});

describe("fuente del tipo de cambio", () => {
  test("sin nada guardado: consulta, guarda con su fecha y lo usa", async () => {
    const s = setup();
    expect(await s.source.get()).toEqual({ ok: true, rate: 0.89509, rateDate: "2026-10-30", ageDays: 3, stale: false });
    expect(s.inserted).toEqual([{ rate: 0.89509, rateDate: "2026-10-30" }]);
  });

  test("consultado hace menos de un día: no vuelve a consultar", async () => {
    const s = setup({ stored: stored("2026-10-30", 2 * HOUR) });
    expect(await s.source.get()).toMatchObject({ ok: true, rate: 0.9, stale: false });
    expect(s.fetches()).toBe(0);
  });

  test("como mucho una consulta: la respuesta se reutiliza en memoria", async () => {
    const s = setup();
    await s.source.get();
    await s.source.get();
    expect(s.fetches()).toBe(1);
  });

  test("consultado hace más de un día: consulta otra vez", async () => {
    const s = setup({ stored: stored("2026-10-29", 2 * DAY) });
    expect(await s.source.get()).toMatchObject({ rate: 0.89509, stale: false });
    expect(s.fetches()).toBe(1);
  });

  test("fin de semana: un tipo de hace 3 días con consulta correcta no es un aviso", async () => {
    const s = setup();
    expect(await s.source.get()).toMatchObject({ ageDays: 3, stale: false });
  });

  for (const [name, fail] of [
    ["HTTP 500", () => res({}, 500)],
    ["respuesta rara", () => res({ nope: true })],
    ["red caída", () => { throw new Error("ECONNRESET"); }],
  ] as const) {
    test(`${name}: usa el último guardado de menos de 7 días y lo marca`, async () => {
      const s = setup({ stored: stored("2026-10-28", 3 * DAY), fetch: fail });
      expect(await s.source.get()).toEqual({ ok: true, rate: 0.9, rateDate: "2026-10-28", ageDays: 5, stale: true });
    });
  }

  test("falla la consulta con un tipo de 6 días: sirve; de 7 días: fail-closed", async () => {
    const fail = () => res({}, 500);
    expect(await setup({ stored: stored("2026-10-27", 6 * DAY), fetch: fail }).source.get()).toMatchObject({ ok: true, ageDays: 6, stale: true });
    expect(await setup({ stored: stored("2026-10-26", 7 * DAY), fetch: fail }).source.get()).toEqual({ ok: false });
  });

  test("falla la consulta y no hay nada guardado: fail-closed, sin inventar", async () => {
    expect(await setup({ fetch: () => res({}, 500) }).source.get()).toEqual({ ok: false });
  });

  test("la consulta responde pero con un tipo de hace 7 días o más: no vale", async () => {
    const s = setup({ fetch: () => res({ ...REAL, date: "2026-10-20" }) });
    expect(await s.source.get()).toEqual({ ok: false });
    expect(s.inserted).toEqual([]);
  });

  test("un tipo con fecha futura no se acepta", async () => {
    expect(await setup({ fetch: () => res({ ...REAL, date: "2026-11-09" }) }).source.get()).toEqual({ ok: false });
  });

  test("falla la BD al leer: consulta igualmente", async () => {
    expect(await setup({ readFails: true }).source.get()).toMatchObject({ ok: true, rate: 0.89509 });
  });

  test("falla la BD al guardar: el tipo es real y se usa", async () => {
    expect(await setup({ writeFails: true }).source.get()).toMatchObject({ ok: true, rate: 0.89509, stale: false });
  });

  test("tras un fallo no consulta en cada petición, y reintenta pasado un rato", async () => {
    const s = setup({ stored: stored("2026-10-30", 2 * DAY), fetch: () => res({}, 500) });
    await s.source.get();
    s.advance(11 * 60_000); // caduca la memoria, pero aún no toca reintentar
    await s.source.get();
    expect(s.fetches()).toBe(1);
    s.advance(10 * 60_000);
    await s.source.get();
    expect(s.fetches()).toBe(2);
  });

  test("un tipo en memoria caduca aunque pasen los días", async () => {
    const s = setup({ stored: stored("2026-10-30", 2 * HOUR) });
    expect(await s.source.get()).toMatchObject({ ok: true });
    s.advance(5 * 60_000);
    expect(await s.source.get()).toMatchObject({ ok: true, ageDays: 3 });
  });
});

describe("migración v2.6", () => {
  const sql = readFileSync(join(import.meta.dir, "../../../supabase/migration_v2_6_cj_fx.sql"), "utf8");
  const schema = readFileSync(join(import.meta.dir, "../../../supabase/schema.sql"), "utf8");

  test("fx_rates: RLS, nada para anon/authenticated y solo SELECT + INSERT al backend", () => {
    expect(sql).toMatch(/ALTER TABLE public\.fx_rates ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.fx_rates FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.fx_rates TO service_role/);
  });

  test("no concede nada a anon ni a authenticated, ni toca products_public", () => {
    expect(sql).not.toMatch(/GRANT[^;]*\b(anon|authenticated)\b/);
    expect(sql).not.toMatch(/products_public\s*(AS|WITH)|VIEW/i);
  });

  test("schema.sql lo incorpora", () => {
    expect(schema).toContain("public.fx_rates");
    expect(schema).toContain("fx_buffer_pct");
    expect(schema).toContain("supplier_seller_id");
  });
});

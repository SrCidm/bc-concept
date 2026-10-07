import { describe, expect, test } from "bun:test";
import { SupplierError } from "./errors";
import { supplierFetchJson } from "./http";

const SECRET = "sk_live_SUPER_SECRET_KEY_123";
const init = { headers: { Authorization: `Bearer ${SECRET}` } };

function seq(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string }> = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push({ url: String(url) });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

async function catchErr(p: Promise<unknown>): Promise<SupplierError> {
  try {
    await p;
  } catch (e) {
    return e as SupplierError;
  }
  throw new Error("expected to throw");
}

describe("supplierFetchJson", () => {
  test("200 devuelve el JSON", async () => {
    const { fetchImpl } = seq(json({ ok: 1 }));
    expect(await supplierFetchJson("https://x.test/a", init, { fetchImpl })).toEqual({ ok: 1 });
  });

  test("429 con Retry-After: espera ese tiempo y reintenta", async () => {
    const sleeps: number[] = [];
    const { fetchImpl, calls } = seq(json({}, 429, { "retry-after": "2" }), json({ ok: 1 }));
    const out = await supplierFetchJson("https://x.test/a", init, {
      fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(out).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  test("5xx persistente: 1 intento + 3 reintentos y error 'upstream'", async () => {
    const { fetchImpl, calls } = seq(json({}, 500));
    const err = await catchErr(
      supplierFetchJson("https://x.test/a", init, { fetchImpl, sleep: async () => {} })
    );
    expect(calls).toHaveLength(4);
    expect(err.code).toBe("upstream");
  });

  test("429 persistente → 'rate_limited'", async () => {
    const { fetchImpl } = seq(json({}, 429));
    const err = await catchErr(
      supplierFetchJson("https://x.test/a", init, { fetchImpl, sleep: async () => {} })
    );
    expect(err.code).toBe("rate_limited");
  });

  test("401/403/404/4xx no se reintentan", async () => {
    for (const [status, code] of [[401, "unauthorized"], [403, "unauthorized"], [404, "not_found"], [422, "invalid_request"]] as const) {
      const { fetchImpl, calls } = seq(json({}, status));
      const err = await catchErr(supplierFetchJson("https://x.test/a", init, { fetchImpl }));
      expect(err.code).toBe(code);
      expect(calls).toHaveLength(1);
    }
  });

  test("JSON inválido → 'bad_response' sin reintentos", async () => {
    const { fetchImpl, calls } = seq(new Response("<html>nope</html>", { status: 200 }));
    const err = await catchErr(supplierFetchJson("https://x.test/a", init, { fetchImpl }));
    expect(err.code).toBe("bad_response");
    expect(calls).toHaveLength(1);
  });

  test("timeout → 'timeout'", async () => {
    const fetchImpl = ((_url: string, opts: RequestInit) =>
      new Promise((_resolve, reject) => {
        opts.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      })) as unknown as typeof fetch;
    const err = await catchErr(
      supplierFetchJson("https://x.test/a", init, { fetchImpl, timeoutMs: 10, maxRetries: 0 })
    );
    expect(err.code).toBe("timeout");
  });

  test("los errores NO contienen la key ni el cuerpo del proveedor", async () => {
    const { fetchImpl } = seq(
      new Response(`{"leak":"${SECRET}"}`, { status: 500, headers: { "x-key": SECRET } })
    );
    const err = await catchErr(
      supplierFetchJson("https://x.test/a", init, { fetchImpl, sleep: async () => {} })
    );
    for (const text of [err.message, JSON.stringify(err), String(err), JSON.stringify(err.toJSON())]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("leak");
    }
  });
});

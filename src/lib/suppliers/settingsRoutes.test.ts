import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Rutas REALES de ajustes de margen (/api/admin/settings/margin[/preview]).
 * Se sustituyen `requireAdmin`/`resolveAdmin` y el almacén de margin_settings
 * (en memoria, de solo inserción): nunca se toca la BD real.
 */

let session: "none" | "admin" | "forbidden" = "admin";
const inserted: Array<{ values: Record<string, number>; createdBy: string; note: string | null }> = [];
const calls: string[] = [];

mock.module("@/lib/auth/requireAdmin", () => ({
  resolveAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : session === "forbidden"
        ? { ok: false, status: 403, code: "forbidden", message: "x", email: "otro@example.com" }
        : { ok: false, status: 401, code: "unauthenticated", message: "x", email: null },
  requireAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : {
          ok: false,
          response: new Response(JSON.stringify({ error: { code: session === "forbidden" ? "forbidden" : "unauthenticated" } }), {
            status: session === "forbidden" ? 403 : 401,
          }),
        },
}));

mock.module("@/lib/pricing/settingsStore", () => ({
  supabaseMarginSettingsStore: {
    latest: async () => {
      calls.push("latest");
      const r = inserted[inserted.length - 1];
      return r ? { id: inserted.length, values: r.values, createdBy: r.createdBy, createdAt: "2026-10-20T10:00:00.000Z", note: r.note } : null;
    },
    history: async () => {
      calls.push("history");
      return inserted
        .map((r, i) => ({ id: i + 1, values: r.values, createdBy: r.createdBy, createdAt: "2026-10-20T10:00:00.000Z", note: r.note }))
        .reverse();
    },
    insert: async (row: { values: Record<string, number>; createdBy: string; note: string | null }) => {
      calls.push("insert");
      inserted.push(row);
      return { id: inserted.length, values: row.values, createdBy: row.createdBy, createdAt: "2026-10-20T10:00:00.000Z", note: row.note };
    },
  },
}));

beforeEach(() => {
  session = "admin";
  inserted.length = 0;
  calls.length = 0;
});

const same = { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" };
const post = (body: unknown, headers: Record<string, string> = same) =>
  new Request("http://localhost:3000/x", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const VALUES = {
  returnsBufferPct: 6,
  shippingCost: 4.5,
  acquisitionCost: 0,
  targetMinPct: 15,
  targetMaxPct: 35,
  stripePct: 1.5,
  stripeFixed: 0.25,
};

async function load() {
  const save = await import("@/app/api/admin/settings/margin/route");
  const preview = await import("@/app/api/admin/settings/margin/preview/route");
  return { save, preview };
}

describe("sin sesión de admin no se escribe nada", () => {
  test("401 sin sesión y 403 sin permiso, en ambas rutas; 0 escrituras", async () => {
    const { save, preview } = await load();
    for (const s of ["none", "forbidden"] as const) {
      session = s;
      const expected = s === "none" ? 401 : 403;
      expect((await save.POST(post(VALUES))).status).toBe(expected);
      expect((await preview.POST(post(VALUES))).status).toBe(expected);
    }
    expect(inserted).toHaveLength(0);
    expect(calls).not.toContain("insert");
  });
});

describe("guardar", () => {
  test("200: inserta UNA fila con el email de la sesión (no el del cliente) y devuelve el panel; no-store", async () => {
    const { save } = await load();
    const r = await save.POST(post({ ...VALUES, targetMinPct: 20, note: "Valores iniciales", createdBy: "evil@x.com" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ createdBy: "yosra@example.com", note: "Valores iniciales" });
    const d = await r.json();
    expect(d).toMatchObject({ vatPct: 21, origin: "db", savedBy: "yosra@example.com" });
    expect(d.values.targetMinPct).toBe(20);
  });

  test("fuera de rango → 400 con los nombres de campo y sin eco de los valores; nada escrito", async () => {
    const { save } = await load();
    const r = await save.POST(post({ ...VALUES, returnsBufferPct: 66.66, stripePct: 12 }));
    expect(r.status).toBe(400);
    const d = await r.json();
    expect(d).toEqual({ error: { code: "invalid_request", fields: ["returnsBufferPct", "stripePct"] } });
    expect(JSON.stringify(d)).not.toContain("66.66");
    expect(inserted).toHaveLength(0);
  });
});

describe("preview (ejemplo en vivo)", () => {
  test("200 con el PVP mínimo para un coste de 20 €; no escribe", async () => {
    const { preview } = await load();
    const r = await preview.POST(post(VALUES));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.cost).toBe(20);
    expect(d.minPrice).toBeGreaterThan(20);
    expect(calls).not.toContain("insert");
  });
});

describe("endurecimiento", () => {
  test("Origin de otro sitio → 400 (CSRF) en ambas rutas, sin escribir", async () => {
    const { save, preview } = await load();
    const evil = { ...same, origin: "https://evil.example" };
    expect((await save.POST(post(VALUES, evil))).status).toBe(400);
    expect((await preview.POST(post(VALUES, evil))).status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  test("cuerpo no JSON, vacío, enorme o mal formado → 400 sin eco", async () => {
    const { save } = await load();
    for (const [body, headers] of [
      ["{", same],
      ["", same],
      [JSON.stringify({ ...VALUES, note: "x".repeat(5_000) }), same],
      [JSON.stringify(VALUES), { ...same, "content-type": "text/plain" }],
    ] as Array<[string, Record<string, string>]>) {
      const r = await save.POST(post(body, headers));
      expect(r.status).toBe(400);
      expect(JSON.stringify(await r.json())).not.toContain("xxxx");
    }
    expect(inserted).toHaveLength(0);
  });
});

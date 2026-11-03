import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Rutas REALES de /api/admin/products/[id]/**. Solo se sustituye la sesión (vive en
 * lib/suppliers con los demás tests de rutas: `mock.module` dura todo el proceso y
 * debe ejecutarse después de los tests de la propia guarda, en lib/auth). Cada
 * caso se corta antes de la BD (sesión, origen, id o cuerpo): ningún test de
 * aquí puede leer ni escribir en Supabase.
 */

let session: "none" | "admin" = "admin";

mock.module("@/lib/auth/requireAdmin", () => ({
  resolveAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : { ok: false, status: 401, code: "unauthenticated", message: "x", email: null },
  requireAdmin: async () =>
    session === "admin"
      ? { ok: true, userId: "u1", email: "yosra@example.com" }
      : { ok: false, response: new Response(JSON.stringify({ error: { code: "unauthenticated" } }), { status: 401 }) },
}));

beforeEach(() => {
  session = "admin";
});

const ID = "6f1c2a9e-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const ctx = (id: string) => ({ params: { id } });
const same = { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" };
const req = (method: string, body?: unknown, headers: Record<string, string> = same) =>
  new Request("http://localhost:3000/x", { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

async function load() {
  return {
    item: await import("@/app/api/admin/products/[id]/route"),
    margin: await import("@/app/api/admin/products/[id]/margin/route"),
    sample: await import("@/app/api/admin/products/[id]/sample/route"),
    publish: await import("@/app/api/admin/products/[id]/publish/route"),
    unpublish: await import("@/app/api/admin/products/[id]/unpublish/route"),
  };
}

const code = async (r: Response) => ((await r.json()) as { error?: { code?: string } }).error?.code;

describe("/api/admin/products/[id]", () => {
  test("sin sesión: 401 en todas, antes de mirar nada más", async () => {
    session = "none";
    const r = await load();
    const rs = await Promise.all([
      r.item.PATCH(req("PATCH", {}), ctx(ID)),
      r.item.DELETE(req("DELETE"), ctx(ID)),
      r.margin.POST(req("POST", {}), ctx("no-es-uuid")),
      r.sample.POST(req("POST", {}, { "content-type": "application/json" }), ctx(ID)),
      r.publish.POST(req("POST", {}), ctx(ID)),
      r.unpublish.POST(req("POST"), ctx(ID)),
    ]);
    expect(rs.map((x) => x.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  test("sin Origin del propio sitio: 400 en las que escriben", async () => {
    const r = await load();
    const noOrigin = { "content-type": "application/json", host: "localhost:3000" };
    const evil = { ...same, origin: "https://evil.example" };
    const rs = await Promise.all([
      r.item.PATCH(req("PATCH", {}, noOrigin), ctx(ID)),
      r.item.DELETE(req("DELETE", undefined, evil), ctx(ID)),
      r.sample.POST(req("POST", { verified: false }, evil), ctx(ID)),
      r.publish.POST(req("POST", {}, noOrigin), ctx(ID)),
      r.unpublish.POST(req("POST", undefined, evil), ctx(ID)),
      r.margin.POST(req("POST", { priceRetail: 10 }, evil), ctx(ID)),
    ]);
    expect(rs.map((x) => x.status)).toEqual([400, 400, 400, 400, 400, 400]);
  });

  test("id que no es UUID: 404 sin consultar", async () => {
    const r = await load();
    for (const res of [
      await r.item.DELETE(req("DELETE"), ctx("../../etc")),
      await r.unpublish.POST(req("POST"), ctx("1 OR 1=1")),
      await r.publish.POST(req("POST", {}), ctx("abc")),
    ]) {
      expect(res.status).toBe(404);
      expect(await code(res)).toBe("not_found");
    }
  });

  test("cuerpo no válido: 400 con solo el código y no-store", async () => {
    const r = await load();
    const rs = [
      await r.item.PATCH(req("PATCH", { title: "ab", priceRetail: 10 }), ctx(ID)),
      await r.item.PATCH(req("PATCH", "{no json"), ctx(ID)),
      await r.sample.POST(req("POST", { verified: true, notes: "corta" }), ctx(ID)),
      await r.publish.POST(req("POST", { confirmMarginDrop: "sí" }), ctx(ID)),
      await r.margin.POST(req("POST", { priceRetail: 0 }), ctx(ID)),
    ];
    for (const res of rs) {
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await code(res)).toBe("invalid_request");
    }
  });

  test("límites de tamaño: textos hasta 32 KB al guardar; 4 KB en el resto", async () => {
    const r = await load();
    const huge = JSON.stringify({ title: "Cojín", description: "x".repeat(40_000), priceRetail: 10 });
    expect((await r.item.PATCH(req("PATCH", huge), ctx(ID))).status).toBe(400);
    const notes = JSON.stringify({ verified: true, notes: "x".repeat(5_000) });
    expect((await r.sample.POST(req("POST", notes), ctx(ID))).status).toBe(400);
  });

  test("publicar declara maxDuration (vuelve a pedir el producto al proveedor)", async () => {
    const { publish } = await load();
    expect(publish.maxDuration).toBe(60);
  });
});

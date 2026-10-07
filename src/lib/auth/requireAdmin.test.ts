import { describe, expect, test } from "bun:test";
import { parseAdminEmails, requireAdmin, type AdminUser } from "./requireAdmin";

const admin: AdminUser = { id: "u1", email: "Yosra@Example.com", emailConfirmed: true };

async function status(deps: Parameters<typeof requireAdmin>[0]) {
  const r = await requireAdmin(deps);
  return r.ok ? 200 : r.response.status;
}

describe("requireAdmin (fail-closed)", () => {
  test("sin sesión → 401", async () => {
    expect(await status({ getUser: async () => null, adminEmails: "yosra@example.com" })).toBe(401);
  });

  test("si Auth falla (excepción) → 401, nunca se abre", async () => {
    expect(
      await status({
        getUser: async () => {
          throw new Error("auth down");
        },
        adminEmails: "yosra@example.com",
      })
    ).toBe(401);
  });

  test("ADMIN_EMAILS vacía o sin definir → 403 aunque haya sesión", async () => {
    expect(await status({ getUser: async () => admin, adminEmails: "" })).toBe(403);
    expect(await status({ getUser: async () => admin, adminEmails: undefined })).toBe(403);
    expect(await status({ getUser: async () => admin, adminEmails: " , ," })).toBe(403);
  });

  test("email fuera de la lista → 403", async () => {
    expect(await status({ getUser: async () => admin, adminEmails: "otra@example.com" })).toBe(403);
  });

  test("email sin confirmar → 403", async () => {
    expect(
      await status({ getUser: async () => ({ ...admin, emailConfirmed: false }), adminEmails: "yosra@example.com" })
    ).toBe(403);
  });

  test("usuario sin email → 403", async () => {
    expect(
      await status({ getUser: async () => ({ ...admin, email: null }), adminEmails: "yosra@example.com" })
    ).toBe(403);
  });

  test("admin autorizado (sin distinguir mayúsculas) → ok", async () => {
    const r = await requireAdmin({ getUser: async () => admin, adminEmails: "sergio@example.com, yosra@example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email).toBe("yosra@example.com");
  });

  test("las respuestas de rechazo no se cachean y no revelan por qué", async () => {
    const r = await requireAdmin({ getUser: async () => admin, adminEmails: "x@y.z" });
    if (r.ok) throw new Error("debería denegar");
    expect(r.response.headers.get("cache-control")).toBe("no-store");
    const body = await r.response.json();
    expect(JSON.stringify(body)).not.toContain("example.com");
  });
});

describe("normalización de ADMIN_EMAILS y del email del usuario (trim + lowercase)", () => {
  // Valor tal como podría llegar de un .env mal formateado.
  const RAW = "yosra@BC.com , hola@bc.com";

  test('"yosra@BC.com , hola@bc.com" (espacios y mayúsculas) autoriza a yosra@bc.com', async () => {
    const r = await requireAdmin({
      getUser: async () => ({ id: "u1", email: "yosra@bc.com", emailConfirmed: true }),
      adminEmails: RAW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email).toBe("yosra@bc.com");
  });

  test("también autoriza a la otra entrada de la lista", async () => {
    expect(
      await status({ getUser: async () => ({ id: "u2", email: "hola@bc.com", emailConfirmed: true }), adminEmails: RAW })
    ).toBe(200);
  });

  test("el email del usuario con mayúsculas y espacios alrededor también se normaliza", async () => {
    for (const email of ["  Yosra@BC.com ", "YOSRA@BC.COM", "\tyosra@bc.com\n"]) {
      expect(
        await status({ getUser: async () => ({ id: "u1", email, emailConfirmed: true }), adminEmails: RAW })
      ).toBe(200);
    }
  });

  test("normalizar no abre de más: otro correo o solo espacios siguen denegados", async () => {
    for (const email of ["otra@bc.com", "yosra@bc.com.evil.com", "xyosra@bc.com", "   ", ""]) {
      expect(
        await status({ getUser: async () => ({ id: "u3", email, emailConfirmed: true }), adminEmails: RAW })
      ).toBe(403);
    }
  });

  test("lista vacía o ausente sigue siendo 'denegar todo' aunque el email coincida", async () => {
    const u = { id: "u1", email: "yosra@bc.com", emailConfirmed: true };
    expect(await status({ getUser: async () => u, adminEmails: "" })).toBe(403);
    expect(await status({ getUser: async () => u, adminEmails: "   ,  , " })).toBe(403);
    expect(await status({ getUser: async () => u, adminEmails: undefined })).toBe(403);
  });
});

describe("parseAdminEmails", () => {
  test("normaliza, recorta y descarta vacíos", () => {
    expect(Array.from(parseAdminEmails(" A@x.com , b@X.com ,, "))).toEqual(["a@x.com", "b@x.com"]);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });
});

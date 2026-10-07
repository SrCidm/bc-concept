import { describe, expect, test } from "bun:test";
import {
  deleteApiKey,
  envApiKey,
  getCredentialStatus,
  resolveApiKey,
  setApiKey,
  type CredentialStore,
  type StoredCredential,
} from "./credentials";
import type { SupplierId } from "./types";

function memoryStore(initial: Partial<Record<SupplierId, StoredCredential>> = {}): CredentialStore {
  const data = new Map<SupplierId, StoredCredential>(Object.entries(initial) as [SupplierId, StoredCredential][]);
  return {
    async get(s) {
      return data.get(s) ?? null;
    },
    async setApiKey(s, apiKey) {
      const updatedAt = "2026-10-07T10:00:00.000Z";
      data.set(s, { apiKey, updatedAt });
      return { updatedAt };
    },
    async delete(s) {
      data.delete(s);
    },
  };
}

describe("resolución de la API key (BD > env)", () => {
  test("la key de BD gana sobre la del entorno (permite rotar sin redeploy)", async () => {
    const store = memoryStore({ bigbuy: { apiKey: "db-key", updatedAt: "t" } });
    expect(await resolveApiKey("bigbuy", { store, env: { BIGBUY_API_KEY: "env-key" } })).toBe("db-key");
  });

  test("sin BD usa el entorno; sin ninguna → null", async () => {
    expect(await resolveApiKey("bigbuy", { store: memoryStore(), env: { BIGBUY_API_KEY: " env-key " } })).toBe("env-key");
    expect(await resolveApiKey("bigbuy", { store: memoryStore(), env: { BIGBUY_API_KEY: "" } })).toBeNull();
    expect(await resolveApiKey("bigbuy", { store: memoryStore(), env: {} })).toBeNull();
  });

  test("una fila sin api_key (p. ej. solo tokens) no cuenta", async () => {
    const store = memoryStore({ bigbuy: { apiKey: null, updatedAt: "t" } });
    expect(await resolveApiKey("bigbuy", { store, env: {} })).toBeNull();
  });

  test("envApiKey lee la variable del proveedor correcto", () => {
    expect(envApiKey("bigbuy", { BIGBUY_API_KEY: "a", CJ_API_KEY: "b" })).toBe("a");
    expect(envApiKey("cj", { BIGBUY_API_KEY: "a", CJ_API_KEY: "b" })).toBe("b");
  });
});

describe("estado y escritura", () => {
  test("getCredentialStatus nunca incluye la key", async () => {
    const store = memoryStore({ bigbuy: { apiKey: "db-key-SECRET", updatedAt: "t" } });
    const status = await getCredentialStatus("bigbuy", { store, env: {} });
    expect(status).toEqual({ configured: true, source: "db", updatedAt: "t" });
    expect(JSON.stringify(status)).not.toContain("SECRET");
  });

  test("source: db | env | none", async () => {
    expect((await getCredentialStatus("bigbuy", { store: memoryStore(), env: { BIGBUY_API_KEY: "x" } })).source).toBe("env");
    expect((await getCredentialStatus("bigbuy", { store: memoryStore(), env: {} })).source).toBe("none");
  });

  test("set → configured; delete → vuelve al entorno / none", async () => {
    const store = memoryStore();
    await setApiKey("bigbuy", "new-key", { store });
    expect((await getCredentialStatus("bigbuy", { store, env: {} })).configured).toBe(true);
    await deleteApiKey("bigbuy", { store });
    expect((await getCredentialStatus("bigbuy", { store, env: {} })).configured).toBe(false);
  });
});

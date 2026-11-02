import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Los fixtures son respuestas reales de CJ que se versionan: ni tokens, ni datos
 * de la cuenta o del proveedor. `scripts/cj-discover.ts` los recorta; este test
 * comprueba el resultado, venga de donde venga.
 */
const DIR = join(import.meta.dir, "__fixtures__");
const FORBIDDEN_KEYS = ["accessToken", "refreshToken", "openId", "requestId", "supplierName", "supplierId", "pointsInfo", "apiKey", "contacts", "phone", "address1", "address2", "zipCode"];

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      keysOf(v, found);
    }
  }
  return found;
}

describe("fixtures de CJ", () => {
  test("existen y son JSON válido", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) expect(() => JSON.parse(readFileSync(join(DIR, f), "utf8"))).not.toThrow();
  });

  test("sin claves sensibles", () => {
    for (const f of files) {
      const keys = keysOf(JSON.parse(readFileSync(join(DIR, f), "utf8")));
      expect({ file: f, leaked: FORBIDDEN_KEYS.filter((k) => keys.has(k)) }).toEqual({ file: f, leaked: [] });
    }
  });

  test("sin la API key ni nada con forma de token", () => {
    const key = process.env.CJ_API_KEY?.trim();
    for (const f of files) {
      const text = readFileSync(join(DIR, f), "utf8");
      if (key) expect(text.includes(key)).toBe(false);
      expect(text).not.toMatch(/@api@/);
      expect(text).not.toMatch(/\beyJ[A-Za-z0-9_-]{10,}/); // JWT
      expect(text).not.toMatch(/API@CJ/);
    }
  });
});

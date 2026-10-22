import { describe, expect, test } from "bun:test";
import { contactEmail } from "./contact";

describe("CONTACT_EMAIL", () => {
  test("sin variable o vacía → null (la página no inventa un email)", () => {
    expect(contactEmail({})).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: "" })).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: "   " })).toBeNull();
  });

  test("formato inválido → null", () => {
    for (const v of ["hola", "hola@", "@dominio.es", "a b@dominio.es", "hola@dominio", "x@y.z", "<a@b.es>", 'a"@b.es']) {
      expect(contactEmail({ CONTACT_EMAIL: v })).toBeNull();
    }
    expect(contactEmail({ CONTACT_EMAIL: `${"a".repeat(250)}@b.es` })).toBeNull();
  });

  test("email válido → recortado tal cual", () => {
    expect(contactEmail({ CONTACT_EMAIL: " hola@bcconcept.es " })).toBe("hola@bcconcept.es");
    expect(contactEmail({ CONTACT_EMAIL: "atencion.cliente+web@mi-dominio.com" })).toBe("atencion.cliente+web@mi-dominio.com");
  });
});

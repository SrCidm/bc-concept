import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_ERROR_STATUS, PUBLISH_REASONS } from "@/lib/admin/products.types";
import { failureKey, FIELD, REASON_FIELD, REQUIREMENTS } from "./fields";
import { productsListHref } from "./productsHref";

const es = JSON.parse(readFileSync(join(import.meta.dir, "../../../../messages/es.json"), "utf8"));
const edit = es.admin.products.edit;
const DIR = import.meta.dir;
const sources = readdirSync(DIR)
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
  .map((f) => ({ f, src: readFileSync(join(DIR, f), "utf8") }));

describe("rechazos en frases claras", () => {
  test("cada motivo de publicación tiene su frase y su campo", () => {
    for (const r of PUBLISH_REASONS) {
      expect({ r, sentence: typeof edit.reasons[r] }).toEqual({ r, sentence: "string" });
      expect(Object.values(FIELD)).toContain(REASON_FIELD[r]);
    }
  });

  test("cada código de error del servidor tiene frase (salvo los que la UI trata aparte)", () => {
    const special = new Set(["publish_blocked", "margin_dropped", "unsupported"]);
    for (const code of Object.keys(PRODUCT_ERROR_STATUS)) {
      if (special.has(code)) continue;
      expect({ code, key: failureKey(code) }).toEqual({ code, key: code });
      expect({ code, sentence: typeof edit.failures[code] }).toEqual({ code, sentence: "string" });
    }
    expect(failureKey("algo_raro")).toBe("generic");
    expect(typeof edit.failures.generic).toBe("string");
    expect(typeof edit.failures.network).toBe("string");
  });

  test("la lista de requisitos cubre todos los motivos", () => {
    expect(REQUIREMENTS.flatMap((r) => r.reasons).sort()).toEqual([...PUBLISH_REASONS].sort());
    for (const r of REQUIREMENTS) expect(typeof edit.requirements[r.key]).toBe("string");
  });

  test("los textos no mencionan códigos internos ni al proveedor por su nombre", () => {
    const sentences = [...Object.values(edit.reasons), ...Object.values(edit.failures)] as string[];
    for (const s of sentences) expect({ s, internal: /_|\bCJ\b|BigBuy/.test(s) }).toEqual({ s, internal: false });
  });
});

describe("los enlaces llevan a campos que existen", () => {
  test("cada id de FIELD se usa como id de un control de la ficha", () => {
    const ui = sources.map((s) => s.src).join("\n");
    for (const [k, id] of Object.entries(FIELD)) {
      expect({ k, used: new RegExp(`id=\\{FIELD(?:_ID\\[[a-zA-Z"]+\\]|\\.${k})\\}`).test(ui) || ui.includes(`FIELD_ID[k]`) }).toEqual({ k, used: true });
      expect(id).toMatch(/^product-[a-z-]+$/);
    }
  });
});

describe("confirmaciones en diálogo propio", () => {
  test("ningún componente usa confirm() ni alert() del navegador", () => {
    for (const { f, src } of sources) {
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect({ f, native: /\b(window\.)?(confirm|alert|prompt)\s*\(/.test(code) }).toEqual({ f, native: false });
    }
  });

  test("descartar y la bajada de margen pasan por ConfirmDialog (<dialog> nativo)", () => {
    const panel = sources.find((s) => s.f === "PublishPanel.tsx")!.src;
    expect(panel.match(/<ConfirmDialog/g)?.length).toBe(2);
    expect(panel).toMatch(/onConfirm=\{discard\}/);
    expect(panel).toMatch(/onConfirm=\{\(\) => publish\(true\)\}/);
    expect(sources.find((s) => s.f === "ConfirmDialog.tsx")!.src).toMatch(/showModal\(\)/);
  });

  test("publicar tiene estado de carga visible y anunciado", () => {
    const panel = sources.find((s) => s.f === "PublishPanel.tsx")!.src;
    expect(panel).toMatch(/aria-busy=\{busy === "publish"\}/);
    expect(panel).toMatch(/role="status" aria-live="polite"/);
    expect(typeof edit.publish.checkingDetail).toBe("string");
  });
});

describe("solo tokens de color de la marca (las dos paletas)", () => {
  test("sin colores fijos ni estilos en línea", () => {
    for (const { f, src } of sources) {
      expect({ f, hex: /#[0-9a-fA-F]{3,8}\b/.test(src.replace(/href=\{`#\$\{id\}`\}/g, "")) }).toEqual({ f, hex: false });
      expect({ f, inline: /style=\{\{/.test(src) }).toEqual({ f, inline: false });
      expect({ f, palette: /\b(?:bg|text|border|ring)-(?:white|black|gray|red|green|slate|zinc|neutral)-?\d*/.test(src) }).toEqual({ f, palette: false });
    }
  });
});

describe("enlaces del listado", () => {
  test("query canónico: sin valores por defecto", () => {
    expect(productsListHref({})).toBe("/admin/productos");
    expect(productsListHref({ status: null, supplier: null, page: 1 })).toBe("/admin/productos");
    expect(productsListHref({ status: "draft", supplier: "cj", page: 3 })).toEqual({
      pathname: "/admin/productos",
      query: { status: "draft", supplier: "cj", page: "3" },
    });
  });
});

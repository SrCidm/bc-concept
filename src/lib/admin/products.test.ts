import { describe, expect, test } from "bun:test";
import type { FxQuote } from "@/lib/pricing/fx";
import { DEFAULT_MARGIN_PARAMS } from "@/lib/pricing/settings";
import {
  costsToday,
  discardDraft,
  getAdminProduct,
  listAdminProducts,
  normalizeText,
  parseAdminProductsQuery,
  parseSaveInput,
  previewProductMargin,
  readinessReasons,
  saveAdminProduct,
  setSampleVerified,
  unpublishProduct,
} from "./products";
import { ADMIN, draftRow, ID, memoryRepo, NO_SESSION } from "../../../test/productsKit";

const FX: FxQuote = { ok: true, rate: 0.89509, rateDate: "2026-10-30", ageDays: 3, stale: false };
const deps = (repo = memoryRepo().repo, over: Record<string, unknown> = {}) => ({
  resolve: async () => ADMIN,
  repo,
  getParams: async () => DEFAULT_MARGIN_PARAMS,
  getFx: async () => FX,
  ...over,
});

describe("requisitos de publicación (datos guardados)", () => {
  test("un borrador revisado y verificado no tiene motivos", () => {
    expect(readinessReasons(draftRow())).toEqual([]);
  });

  test("recién importado: textos del proveedor sin revisar, sin categoría ni muestra", () => {
    const row = draftRow({
      title: "Cushion Pom-Pom Terracotta 45x45cm",
      description: "Soft cushion with pom-poms.",
      category: null,
      sample_verified_at: null,
    });
    expect(readinessReasons(row)).toEqual(["category_missing", "title_not_reviewed", "description_not_reviewed", "sample_not_verified"]);
  });

  test("la misma normalización en ES y EN: espacios, mayúsculas y saltos no cuentan como revisión", () => {
    const row = draftRow({
      title: "  cushion   POM-POM terracotta\n45x45CM ",
      title_en: "Cushion pom-pom  Terracotta 45x45cm",
      description_en: " soft CUSHION with\tpom-poms. ",
    });
    expect(readinessReasons(row)).toEqual(["title_not_reviewed", "title_en_not_reviewed", "description_en_not_reviewed"]);
    expect(normalizeText("  A\n\tb  C ")).toBe("a b c");
  });

  test("EN vacío no bloquea; EN reescrito tampoco", () => {
    expect(readinessReasons(draftRow({ title_en: "  ", description_en: null }))).toEqual([]);
    expect(readinessReasons(draftRow({ title_en: "Terracotta pom-pom cushion", description_en: "Soft cotton cushion." }))).toEqual([]);
  });

  test("ES vacío o solo espacios → falta; categoría ajena a la tienda → falta", () => {
    expect(readinessReasons(draftRow({ title: "   ", description: null, category: "furniture" }))).toEqual([
      "category_missing",
      "title_missing",
      "description_missing",
    ]);
  });

  test("si el proveedor no dio descripción, cualquier descripción ES vale", () => {
    expect(readinessReasons(draftRow({ supplier_description: null, description: "Soft cushion with pom-poms." }))).toEqual([]);
  });
});

describe("guardar: validación (no corrige)", () => {
  const ok = { title: " Cojín terracota ", description: "Texto", titleEn: "", descriptionEn: null, category: "decor", priceRetail: 39.9 };

  test("recorta y convierte vacíos en null; ignora campos extra", () => {
    expect(parseSaveInput({ ...ok, status: "active", price_cost: 1, slug: "x" })).toEqual({
      title: "Cojín terracota",
      description: "Texto",
      titleEn: null,
      descriptionEn: null,
      category: "decor",
      priceRetail: 39.9,
    });
  });

  test("rechaza título corto o largo, descripción larga, categoría ajena y PVP raro", () => {
    for (const bad of [
      { ...ok, title: "ab" },
      { ...ok, title: "x".repeat(141) },
      { ...ok, titleEn: "ab" },
      { ...ok, description: "x".repeat(5001) },
      { ...ok, category: "furniture" },
      { ...ok, priceRetail: 0 },
      { ...ok, priceRetail: 39.999 },
      { ...ok, priceRetail: "39.90" },
      { ...ok, title: 7 },
    ]) {
      expect(parseSaveInput(bad)).toBeNull();
    }
    expect(parseSaveInput(null)).toBeNull();
    expect(parseSaveInput([])).toBeNull();
  });

  test("guarda con el email de la sesión y devuelve lo que falta", async () => {
    const mem = memoryRepo([draftRow({ category: null })]);
    const r = await saveAdminProduct(ID, ok, deps(mem.repo));
    expect(r).toEqual({ ok: true, data: { reasons: [] } });
    expect(mem.events.map((e) => [e.action, e.actor])).toEqual([["edit", "yosra@bc.com"]]);
  });

  test("un activo no se edita", async () => {
    const mem = memoryRepo([draftRow({ status: "active" })]);
    expect(await saveAdminProduct(ID, ok, deps(mem.repo))).toEqual({ ok: false, code: "not_draft" });
  });
});

describe("muestra", () => {
  test("marcar exige nota de 10 a 1000 caracteres (recortada)", async () => {
    const mem = memoryRepo([draftRow({ sample_verified_at: null, sample_verified_by: null, sample_verified_notes: null })]);
    for (const notes of [undefined, "", "corta", "   corta   ", "x".repeat(1001)]) {
      expect(await setSampleVerified(ID, { verified: true, notes }, deps(mem.repo))).toEqual({ ok: false, code: "invalid_request" });
    }
    expect(mem.calls).not.toContain("setSample");
    const r = await setSampleVerified(ID, { verified: true, notes: "  Costuras y color revisados  " }, deps(mem.repo));
    expect(r).toEqual({ ok: true, data: { reasons: [] } });
    expect(mem.byId.get(ID)?.sample_verified_notes).toBe("Costuras y color revisados");
  });

  test("desmarcar no pide nota y vuelve a bloquear la publicación", async () => {
    const mem = memoryRepo();
    const r = await setSampleVerified(ID, { verified: false }, deps(mem.repo));
    expect(r).toEqual({ ok: true, data: { reasons: ["sample_not_verified"] } });
  });
});

describe("descartar y despublicar", () => {
  test("descartar borra un borrador y deja el evento", async () => {
    const mem = memoryRepo();
    expect(await discardDraft(ID, deps(mem.repo))).toEqual({ ok: true, data: { discarded: true } });
    expect(mem.byId.size).toBe(0);
    expect(mem.events.map((e) => e.action)).toEqual(["discard"]);
  });

  test("un activo NUNCA se descarta", async () => {
    const mem = memoryRepo([draftRow({ status: "active" })]);
    expect(await discardDraft(ID, deps(mem.repo))).toEqual({ ok: false, code: "not_draft" });
    expect(mem.byId.size).toBe(1);
  });

  test("despublicar solo un activo", async () => {
    const mem = memoryRepo([draftRow({ status: "active", slug: "cojin" })]);
    expect(await unpublishProduct(ID, deps(mem.repo))).toEqual({ ok: true, data: { status: "draft" } });
    expect(mem.byId.get(ID)?.slug).toBe("cojin");
    expect(await unpublishProduct(ID, deps(mem.repo))).toEqual({ ok: false, code: "not_active" });
  });
});

describe("la sesión va primero", () => {
  test("sin sesión ninguna función toca la BD", async () => {
    const mem = memoryRepo();
    const d = deps(mem.repo, { resolve: async () => NO_SESSION });
    const rs = await Promise.all([
      listAdminProducts({ status: null, supplier: null, page: 1 }, d),
      getAdminProduct(ID, d),
      saveAdminProduct(ID, {}, d),
      previewProductMargin(ID, { priceRetail: 10 }, d),
      setSampleVerified(ID, { verified: false }, d),
      discardDraft(ID, d),
      unpublishProduct(ID, d),
    ]);
    expect(rs.every((r) => !r.ok && r.code === "unauthenticated")).toBe(true);
    expect(mem.calls).toEqual([]);
  });

  test("si la comprobación de sesión falla, se deniega", async () => {
    const mem = memoryRepo();
    const r = await getAdminProduct(ID, deps(mem.repo, { resolve: async () => { throw new Error("auth down"); } }));
    expect(r).toEqual({ ok: false, code: "unauthenticated" });
    expect(mem.calls).toEqual([]);
  });

  test("id que no es UUID → not_found sin consultar", async () => {
    const mem = memoryRepo();
    expect(await getAdminProduct("../x", deps(mem.repo))).toEqual({ ok: false, code: "not_found" });
    expect(mem.calls).toEqual([]);
  });
});

describe("margen de hoy (sin llamar al proveedor)", () => {
  test("coste y flete originales con el tipo y el colchón de hoy", () => {
    const today = costsToday(draftRow(), DEFAULT_MARGIN_PARAMS, { ...FX, rate: 1 });
    // 7.28 × 1 × 1.03 = 7.50; 9.92 × 1 × 1.03 = 10.22
    expect(today).toEqual({ guardCost: 7.5, shipping: 10.22 });
  });

  test("peor caso entre producto y variantes", () => {
    const row = draftRow({ product_variants: [{ cost_original: "7.28", price_cost: "6.71" }, { cost_original: "9.00", price_cost: "8.30" }] });
    expect(costsToday(row, DEFAULT_MARGIN_PARAMS, { ...FX, rate: 1 })).toEqual({ guardCost: 9.27, shipping: 10.22 });
  });

  test("sin tipo de cambio → sin margen, con el motivo", async () => {
    const mem = memoryRepo();
    const r = await listAdminProducts({ status: null, supplier: null, page: 1 }, deps(mem.repo, { getFx: async () => ({ ok: false }) }));
    if (!r.ok) throw new Error("no ok");
    expect(r.data.items[0].margin).toEqual({ check: null, reason: "fx_unavailable", realShipping: true });
  });

  test("el listado trae coste, PVP, margen, categoría, muestra y estado", async () => {
    const r = await listAdminProducts({ status: null, supplier: null, page: 1 }, deps());
    if (!r.ok) throw new Error("no ok");
    const item = r.data.items[0];
    expect(item).toMatchObject({ id: ID, supplier: "cj", costEur: 6.71, priceRetail: 39.9, category: "textiles", sampleVerified: true, status: "draft" });
    expect(item.margin.realShipping).toBe(true);
    expect(item.margin.check?.shipping).toBe(9.15);
    expect(r.data).toMatchObject({ page: 1, total: 1, hasMore: false });
  });

  test("la guarda en vivo usa el PVP pedido", async () => {
    const r = await previewProductMargin(ID, { priceRetail: 12 }, deps());
    if (!r.ok) throw new Error("no ok");
    expect(r.data.check?.price).toBe(12);
    expect(r.data.check?.belowMin).toBe(true);
    expect(await previewProductMargin(ID, { priceRetail: -1 }, deps())).toEqual({ ok: false, code: "invalid_request" });
  });
});

describe("filtros del listado en la URL", () => {
  test("valores válidos y por defecto", () => {
    expect(parseAdminProductsQuery({})).toEqual({ status: null, supplier: null, page: 1 });
    expect(parseAdminProductsQuery({ status: "draft", supplier: "cj", page: "3" })).toEqual({ status: "draft", supplier: "cj", page: 3 });
    expect(parseAdminProductsQuery({ status: ["active", "draft"] })).toEqual({ status: "draft", supplier: null, page: 1 });
  });

  test("lo demás no es válido", () => {
    for (const sp of [{ status: "archived" }, { supplier: "aliexpress" }, { page: "0" }, { page: "-1" }, { page: "1e3" }]) {
      expect(parseAdminProductsQuery(sp)).toBeNull();
    }
  });
});

describe("ficha", () => {
  test("historial más reciente primero, con campos y nota", async () => {
    const mem = memoryRepo([draftRow({ sample_verified_at: null, sample_verified_by: null, sample_verified_notes: null })]);
    const d = deps(mem.repo);
    await saveAdminProduct(ID, { title: "Cojín nuevo", description: "Texto", category: "textiles", priceRetail: 39.9 }, d);
    await setSampleVerified(ID, { verified: true, notes: "Costuras y color revisados" }, d);
    const r = await getAdminProduct(ID, d);
    if (!r.ok) throw new Error("no ok");
    expect(r.data.events.map((e) => e.action)).toEqual(["sample_verified", "edit"]);
    expect(r.data.events[0].notes).toBe("Costuras y color revisados");
    expect(r.data.reasons).toEqual([]);
    expect(r.data.supplierTitle).toBe("Cushion Pom-Pom Terracotta 45x45cm");
  });
});

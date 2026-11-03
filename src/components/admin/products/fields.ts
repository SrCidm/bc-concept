import type { PublishReason } from "@/lib/admin/products.types";

/** Ids de los campos de la ficha: los motivos de rechazo enlazan aquí. */
export const FIELD = {
  title: "product-title",
  description: "product-description",
  titleEn: "product-title-en",
  descriptionEn: "product-description-en",
  category: "product-category",
  price: "product-price",
  sample: "product-sample",
} as const;

export const REASON_FIELD: Record<PublishReason, string> = {
  category_missing: FIELD.category,
  title_missing: FIELD.title,
  title_not_reviewed: FIELD.title,
  description_missing: FIELD.description,
  description_not_reviewed: FIELD.description,
  title_en_not_reviewed: FIELD.titleEn,
  description_en_not_reviewed: FIELD.descriptionEn,
  sample_not_verified: FIELD.sample,
};

/** Fallos con datos frescos que se arreglan en un campo concreto. */
export const FAILURE_FIELD: Partial<Record<string, string>> = {
  margin_below_min: FIELD.price,
};

/** Códigos con frase propia en `admin.products.edit.failures`; el resto → "generic". */
const FAILURE_KEYS: ReadonlySet<string> = new Set([
  "margin_below_min",
  "supplier_not_found",
  "not_eu_eligible",
  "no_shipping_route",
  "no_delivery_estimate",
  "fx_too_old",
  "fx_unavailable",
  "currency_mismatch",
  "stale",
  "not_draft",
  "not_active",
  "not_found",
  "rate_limited",
  "timeout",
  "upstream",
  "bad_response",
  "unauthorized",
  "not_configured",
  "storage_failed",
  "invalid_request",
  "unauthenticated",
  "forbidden",
  "network",
]);
export const failureKey = (code: string) => (FAILURE_KEYS.has(code) ? code : "generic");

/** Lleva al campo (centrado) y le da el foco, como un enlace de "saltar a". */
export function goToField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  (el as HTMLElement).focus({ preventScroll: true });
}

/** Requisitos de la lista de publicación y los motivos que los incumplen. */
export const REQUIREMENTS: { key: "category" | "title" | "description" | "english" | "sample"; reasons: PublishReason[] }[] = [
  { key: "category", reasons: ["category_missing"] },
  { key: "title", reasons: ["title_missing", "title_not_reviewed"] },
  { key: "description", reasons: ["description_missing", "description_not_reviewed"] },
  { key: "english", reasons: ["title_en_not_reviewed", "description_en_not_reviewed"] },
  { key: "sample", reasons: ["sample_not_verified"] },
];

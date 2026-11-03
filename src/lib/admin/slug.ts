/**
 * Slugs legibles para las URLs de producto: sin tildes, minúsculas, palabras
 * unidas por guiones y como mucho 80 caracteres (el CHECK de la BD exige
 * `^[a-z0-9]+(-[a-z0-9]+)*$`). Se fijan al publicar por primera vez y no cambian.
 */
export const SLUG_MAX = 80;

const SPECIAL: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l", "&": " y " };

export function slugify(text: string): string {
  const ascii = text
    .toLowerCase()
    .replace(/[ßæœøđł&]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const words = ascii.split(/[^a-z0-9]+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > SLUG_MAX) break;
    out = next;
  }
  // Una sola palabra más larga que el máximo: se corta.
  return out || (words[0] ?? "").slice(0, SLUG_MAX);
}

/**
 * Primer slug libre: `base`, `base-2`, `base-3`… El sufijo cabe dentro del
 * máximo recortando la base por una frontera de palabra si hace falta.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, fallback: string): string {
  const root = base || fallback;
  if (!taken.has(root)) return root;
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    let head = root;
    if (head.length + suffix.length > SLUG_MAX) {
      head = head.slice(0, SLUG_MAX - suffix.length).replace(/-+[^-]*$/, "") || head.slice(0, SLUG_MAX - suffix.length);
    }
    const candidate = `${head.replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${fallback}-${Date.now()}`;
}

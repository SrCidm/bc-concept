"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

const checkboxLabel =
  "inline-flex items-center gap-2.5 min-h-11 cursor-pointer text-sm text-bc-text-primary select-none";
const checkbox =
  "h-[1.125rem] w-[1.125rem] shrink-0 rounded-bc border-bc-border accent-bc-accent cursor-pointer " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

interface Props {
  q: string;
  eu: boolean;
  stock: boolean;
}

/**
 * Buscador del catálogo. Funciona sin JS (GET nativo a la misma ruta: el par
 * hidden+checkbox envía `eu=0` y, si está marcado, también `eu=1`, y gana el
 * último). Con JS añade el estado pendiente y evita parámetros por defecto en la
 * URL. Cada búsqueda nueva vuelve a la página 1.
 */
export function ImportSearchForm({ q, eu, stock }: Props) {
  const t = useTranslations("admin.import.search");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);
  const [euOnly, setEuOnly] = useState(eu);
  const [inStock, setInStock] = useState(stock);

  const dirty = q !== "" || !eu || !stock || text !== "" || !euOnly || !inStock;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    const value = text.trim();
    if (value) p.set("q", value);
    if (!euOnly) p.set("eu", "0");
    if (!inStock) p.set("stock", "0");
    const qs = p.toString();
    startTransition(() => router.push(qs ? `/admin/import?${qs}` : "/admin/import"));
  }

  return (
    <form
      role="search"
      action="/admin/import"
      method="get"
      onSubmit={onSubmit}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-bc border border-bc-border bg-bc-surface p-4 md:flex-row md:flex-wrap md:items-end md:gap-x-6"
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-bc-text-primary md:min-w-[16rem]">
        {t("label")}
        <input
          type="search"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("placeholder")}
          className="min-h-11 w-full rounded-bc border border-bc-border bg-bc-bg-base px-3 text-base text-bc-text-primary placeholder:text-bc-text-secondary transition-[border-color,box-shadow] duration-200 ease-bc focus-visible:border-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
        />
      </label>

      <fieldset className="flex flex-wrap items-center gap-x-5">
        <legend className="sr-only">{t("filtersLabel")}</legend>
        <label className={checkboxLabel}>
          <input type="hidden" name="eu" value="0" />
          <input
            type="checkbox"
            name="eu"
            value="1"
            checked={euOnly}
            onChange={(e) => setEuOnly(e.target.checked)}
            className={checkbox}
          />
          {t("euOnly")}
        </label>
        <label className={checkboxLabel}>
          <input type="hidden" name="stock" value="0" />
          <input
            type="checkbox"
            name="stock"
            value="1"
            checked={inStock}
            onChange={(e) => setInStock(e.target.checked)}
            className={checkbox}
          />
          {t("inStockOnly")}
        </label>
      </fieldset>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-bc bg-bc-accent px-6 text-sm text-bc-surface transition-[background-color,transform,opacity] duration-200 ease-bc hover-fine:bg-bc-accent-hover motion-safe:active:scale-[0.97] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
        >
          {pending ? t("submitting") : t("submit")}
        </button>
        {dirty && (
          <Link
            href="/admin/import"
            className="inline-flex min-h-11 items-center rounded-bc px-3 text-sm text-bc-text-secondary transition-[color,background-color] duration-200 ease-bc hover-fine:bg-bc-primary/10 hover-fine:text-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
          >
            {t("clear")}
          </Link>
        )}
      </div>
    </form>
  );
}

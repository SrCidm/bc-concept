import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { importHref } from "./importHref";

/**
 * Selector de proveedor de /admin/import. Son enlaces: el proveedor vive en la URL
 * y cambiar de uno a otro empieza una búsqueda nueva. Server Component.
 */
export function SupplierSelector({
  current,
  options,
}: {
  current: "cj" | "bigbuy";
  options: { id: "cj" | "bigbuy"; connected: boolean }[];
}) {
  const t = useTranslations("admin.import.suppliers");

  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-wrap gap-2">
        {options.map(({ id, connected }) => {
          const active = id === current;
          return (
            <li key={id}>
              <Link
                href={importHref(id === "cj" ? "" : `supplier=${id}`)}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex min-h-11 items-center gap-2 rounded-bc border px-4 text-sm",
                  "transition-[color,background-color,border-color] duration-200 ease-bc",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2",
                  active
                    ? "border-bc-accent bg-bc-accent text-bc-surface"
                    : "border-bc-border bg-bc-surface text-bc-text-primary hover-fine:border-bc-accent hover-fine:text-bc-accent",
                ].join(" ")}
              >
                {t(id)}
                {!connected && <span className={active ? "text-xs text-bc-surface/80" : "text-xs text-bc-text-secondary"}>{t("notConnected")}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

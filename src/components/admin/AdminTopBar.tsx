import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { BackToStoreLink } from "@/components/admin/BackToStoreLink";

const actionClasses =
  "inline-flex items-center min-h-11 px-3 rounded-bc text-sm text-bc-text-secondary " +
  "transition-[color,background-color,transform] duration-200 ease-bc " +
  "hover-fine:text-bc-accent hover-fine:bg-bc-primary/10 motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent";

/** Barra superior del panel. Server Component: recibe el email ya verificado. */
export async function AdminTopBar({ email }: { email: string }) {
  const t = await getTranslations("admin.topbar");
  const items = [{ href: "/admin/import", label: t("nav.import") }];

  return (
    <header className="border-b border-bc-border bg-bc-surface">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-bc focus:bg-bc-accent focus:px-4 focus:py-2 focus:text-sm focus:text-bc-surface"
      >
        {t("skip")}
      </a>
      <div className="max-w-[1320px] mx-auto px-[clamp(1rem,3vw,2rem)] py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        <Link
          href="/admin/import"
          className="inline-flex items-center gap-2 min-h-11 rounded-bc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
        >
          <span className="font-serif text-lg tracking-brand text-bc-text-primary">
            B<span className="font-sans">&amp;</span>C
          </span>
          <span className="text-xs uppercase tracking-widest text-bc-text-secondary">
            Admin
          </span>
        </Link>

        <AdminNav items={items} label={t("navLabel")} />

        <div className="ml-auto flex items-center gap-1">
          <span
            className="hidden md:block max-w-[24ch] truncate text-sm text-bc-text-secondary mr-2"
            title={email}
          >
            {email}
          </span>
          <BackToStoreLink className={actionClasses}>{t("backToStore")}</BackToStoreLink>
          {/* POST con recarga completa (el handler valida mismo origen). */}
          <form action="/api/admin/auth/logout" method="post">
            <button type="submit" className={actionClasses}>
              {t("signOut")}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

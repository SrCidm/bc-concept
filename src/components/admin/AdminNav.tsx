"use client";

import { Link, usePathname } from "@/i18n/navigation";

interface AdminNavItem {
  href: string;
  label: string;
}

/** Navegación del panel (cliente solo para marcar el enlace activo). */
export function AdminNav({ items, label }: { items: AdminNavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex items-center min-h-11 px-3 rounded-bc text-sm",
              "transition-[color,background-color] duration-200 ease-bc",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent",
              active
                ? "bg-bc-primary/10 text-bc-accent font-medium"
                : "text-bc-text-secondary hover-fine:text-bc-accent hover-fine:bg-bc-primary/10",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

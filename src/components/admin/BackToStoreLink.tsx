"use client";

import type { MouseEvent } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAdminMode } from "@/components/admin/AdminModeShell";

/**
 * "Volver a la tienda". En el modo admin (paleta invertida) lanza antes el
 * barrido de salida; en cualquier otro caso (otras admins, reduced-motion,
 * clic con modificadores) navega como un enlace normal.
 */
export function BackToStoreLink({ className, children }: { className: string; children: React.ReactNode }) {
  const mode = useAdminMode();
  const router = useRouter();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!mode) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    mode.leave(() => router.push("/"));
  }

  return (
    <Link href="/" onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/requireAdmin";

/** /admin → panel de importación. */
export default async function AdminIndexPage() {
  await requireAdminPage();
  redirect("/admin/import");
}

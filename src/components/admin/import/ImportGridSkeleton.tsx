import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/Skeleton";

/** Estado de carga: un único `status` anunciado; las tarjetas son decorativas. */
export function ImportGridSkeleton({ count = 12 }: { count?: number }) {
  const t = useTranslations("admin.import");
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-6"
      >
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-bc border border-bc-border bg-bc-surface p-3">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-3 w-1/2" />
            <div className="border-t border-bc-border pt-3">
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/Skeleton";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  const t = useTranslations("common");

  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <ul
        aria-hidden="true"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6"
      >
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-1/4" />
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6"
      aria-busy="true"
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
  );
}

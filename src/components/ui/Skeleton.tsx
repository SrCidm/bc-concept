interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder with shimmer animation.
 * motion-safe: prefix ensures no animation for prefers-reduced-motion users.
 * Server Component.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando…"
      className={[
        "rounded-bc bg-bc-primary/10",
        "motion-safe:animate-pulse",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

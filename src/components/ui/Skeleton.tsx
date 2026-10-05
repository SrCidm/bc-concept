interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder with pulse animation. Decorativo (aria-hidden): el
 * contenedor que agrupa los skeletons anuncia "Cargando…" una sola vez.
 * motion-safe: prefix ensures no animation for prefers-reduced-motion users.
 * Server Component.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
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

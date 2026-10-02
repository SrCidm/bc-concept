interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Neutral pill badge — reusable for categories, states, labels.
 * Server Component.
 */
export function Badge({ children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-0.5",
        "text-xs font-sans font-medium",
        "bg-bc-primary/10 text-bc-accent",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

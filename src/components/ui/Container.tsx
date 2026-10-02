import React from "react";

interface ContainerProps {
  as?: React.ElementType;
  className?: string;
  children: React.ReactNode;
}

/**
 * Max-width container with responsive horizontal padding.
 * Server Component — no client boundary.
 */
export function Container({
  as: Tag = "div",
  className = "",
  children,
}: ContainerProps) {
  return (
    <Tag
      className={[
        "max-w-[1180px] mx-auto px-[clamp(1.25rem,4vw,2.5rem)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

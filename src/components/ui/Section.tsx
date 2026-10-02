import React from "react";

interface SectionProps {
  as?: React.ElementType;
  className?: string;
  children: React.ReactNode;
}

/**
 * Section with rhythmic vertical spacing.
 * Server Component — no client boundary.
 */
export function Section({
  as: Tag = "section",
  className = "",
  children,
}: SectionProps) {
  return (
    <Tag
      className={["py-16 md:py-24", className].filter(Boolean).join(" ")}
    >
      {children}
    </Tag>
  );
}

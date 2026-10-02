"use client";

import { useTranslations } from "next-intl";

interface DeliveryBadgeProps {
  /** Use the short variant ("Entrega 3-7 días") in tight spaces */
  short?: boolean;
  /** Real delivery window (days). When both are given, overrides the generic text. */
  minDays?: number;
  maxDays?: number;
  /** Optional green dot indicator. Off by default (sober, no colour dot). */
  dot?: boolean;
  className?: string;
}

/**
 * Reusable delivery estimate badge.
 * Client Component so it works inside both Server and Client Component trees.
 * Used in: ProductCard, ProductPage, CheckoutSummary. Never in the Hero.
 */
export function DeliveryBadge({
  short = false,
  minDays,
  maxDays,
  dot = false,
  className = "",
}: DeliveryBadgeProps) {
  const t = useTranslations("common");
  const hasRange = minDays !== undefined && maxDays !== undefined;
  const text = hasRange
    ? t("deliveryRange", { min: minDays, max: maxDays })
    : short
      ? t("deliveryShort")
      : t("delivery");

  return (
    <span
      className={[
        "inline-flex items-center gap-2 font-sans text-sm text-bc-text-secondary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={text}
    >
      {dot && (
        <span
          className="w-2 h-2 rounded-full bg-bc-success flex-shrink-0"
          aria-hidden="true"
        />
      )}
      {text}
    </span>
  );
}

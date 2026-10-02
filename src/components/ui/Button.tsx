import React from "react";

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "md" | "lg";

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

// Discriminated union: renders <a> when href is provided, <button> otherwise
type ButtonAsButton = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    href?: undefined;
  };

type ButtonAsAnchor = BaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-bc-accent text-bc-surface hover:bg-bc-accent-hover focus-visible:ring-bc-accent",
  outline:
    "border border-bc-accent text-bc-accent hover:bg-bc-accent hover:text-bc-surface focus-visible:ring-bc-accent",
  ghost:
    "text-bc-text-primary hover:text-bc-accent focus-visible:ring-bc-primary",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

const baseClasses =
  "inline-flex items-center justify-center font-sans rounded-bc " +
  "transition-all ease-bc duration-200 " +
  "active:translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].join(" ");

  if (props.href !== undefined) {
    const { href, ...rest } = props as ButtonAsAnchor;
    return <a href={href} className={classes} {...rest} />;
  }

  const { ...rest } = props as ButtonAsButton;
  return <button className={classes} {...rest} />;
}

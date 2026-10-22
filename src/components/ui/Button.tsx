import React from "react";
import { Link, type AppHref } from "@/i18n/navigation";

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

/** Enlaces fuera de la app (`<a>` normal): email, teléfono o web externa. */
export type ExternalHref = `mailto:${string}` | `tel:${string}` | `https://${string}`;

type ButtonAsAnchor = BaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> & {
    /** Ruta interna tipada (`routing.pathnames`) o enlace externo. */
    href: AppHref | ExternalHref;
  };

function isExternalHref(href: AppHref | ExternalHref): href is ExternalHref {
  return typeof href === "string" && /^(mailto:|tel:|https:\/\/)/.test(href);
}

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

// Transición solo de lo que cambia (nunca `all`). Pulsación: scale .97 en 160ms;
// el color y el brillo cambian algo más despacio. Sin movimiento en reduced-motion.
const baseClasses =
  "inline-flex items-center justify-center font-sans rounded-bc select-none " +
  "transition-[transform,background-color,color,border-color,box-shadow] ease-bc duration-200 " +
  "motion-safe:active:scale-[0.97] motion-safe:active:duration-150 " +
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
    // Rutas internas: Link con locale (navegación SPA, URL localizada y
    // transición de ruta). Externas/mailto: <a> normal.
    if (isExternalHref(href)) {
      return <a href={href} className={classes} {...rest} />;
    }
    return <Link href={href} className={classes} {...rest} />;
  }

  const { ...rest } = props as ButtonAsButton;
  return <button className={classes} {...rest} />;
}

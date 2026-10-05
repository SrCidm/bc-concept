"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { iconControlClasses } from "@/components/layout/controlStyles";

interface SearchBoxProps {
  /** aria-label del campo de texto. */
  label: string;
  placeholder: string;
  className?: string;
  /** Called after a successful submit (e.g. close the mobile menu). */
  onSubmitted?: () => void;
  /**
   * Buscador colapsable (Header de escritorio): en reposo solo la lupa. Con
   * puntero fino (hover real) se abre al pasar el ratón y se recoge al salir
   * si está vacío; con clic/tap se abre y enfoca el campo. Sin esta prop el
   * campo siempre se ve (menú móvil).
   */
  collapsible?: boolean;
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

// Lupa: 44×44 (objetivo táctil) con el lenguaje compartido de controles.
const buttonClasses = `shrink-0 flex items-center justify-center size-11 ${iconControlClasses}`;

const inputClasses =
  "w-full min-w-0 bg-transparent text-sm text-bc-text-primary " +
  "placeholder:text-bc-text-secondary py-1 focus:outline-none";

/** Retardo antes de recoger al salir el ratón (evita parpadeos por temblor). */
const HOVER_LEAVE_MS = 180;

/** Hover real (ratón/trackpad). En táctil no hay hover: todo va por clic/tap. */
const hasFineHover = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Search form → /catalog?q=… (locale-aware). Client Component. */
export function SearchBox({
  label,
  placeholder,
  className = "",
  onSubmitted,
  collapsible = false,
}: SearchBoxProps) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("common");
  const inputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hovering = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [value, setValue] = useState(params.get("q") ?? "");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const isEmpty = () => (inputRef.current?.value ?? "").trim() === "";
  const inputHasFocus = () => document.activeElement === inputRef.current;

  /** Abre y enfoca el campo (clic/tap o tecla). */
  const openAndFocus = () => {
    clearTimeout(leaveTimer.current);
    setExpanded(true);
    // El campo está en el DOM (solo oculto): se enfoca ya, la animación sigue.
    inputRef.current?.focus({ preventScroll: true });
  };

  const collapse = (returnFocus: boolean) => {
    clearTimeout(leaveTimer.current);
    setExpanded(false);
    if (returnFocus) toggleRef.current?.focus({ preventScroll: true });
  };

  // Hover (solo puntero fino): abre al entrar; al salir recoge si está vacío
  // y el campo no tiene el foco (si se está escribiendo, no se cierra).
  const handleMouseEnter = () => {
    if (!collapsible || !hasFineHover()) return;
    hovering.current = true;
    clearTimeout(leaveTimer.current);
    setExpanded(true);
  };

  const handleMouseLeave = () => {
    hovering.current = false;
    if (!collapsible || !hasFineHover()) return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (!hovering.current && isEmpty() && !inputHasFocus()) setExpanded(false);
    }, HOVER_LEAVE_MS);
  };

  // El foco sale del formulario: si está vacío y el ratón no está encima, recoge.
  const handleBlur = (e: FocusEvent<HTMLFormElement>) => {
    if (!collapsible || !expanded) return;
    if (formRef.current?.contains(e.relatedTarget as Node | null)) return;
    if (!hovering.current && isEmpty()) setExpanded(false);
  };

  // Click fuera → colapsa. El foco vuelve a la lupa solo si no lo recogió
  // otro elemento (p. ej. un enlace pulsado): no se le roba al usuario.
  useEffect(() => {
    if (!collapsible || !expanded) return;
    // mousedown + setTimeout(0): el cambio de foco por defecto del navegador
    // ocurre justo después del evento; hay que comprobar el foco DESPUÉS.
    const onMouseDown = (e: MouseEvent) => {
      if (formRef.current?.contains(e.target as Node)) return;
      setExpanded(false);
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body || active === inputRef.current) {
          toggleRef.current?.focus({ preventScroll: true });
        }
      }, 0);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [collapsible, expanded]);

  const submit = () => {
    const q = value.trim();
    if (!q) return false;
    router.push(`/catalog?q=${encodeURIComponent(q)}`);
    onSubmitted?.();
    return true;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submit() && collapsible) collapse(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (collapsible && expanded && e.key === "Escape") {
      e.stopPropagation();
      collapse(true);
    }
  };

  // Variante fija (menú móvil): igual que antes.
  if (!collapsible) {
    return (
      <form
        role="search"
        onSubmit={handleSubmit}
        className={[
          "flex items-center gap-1 border-b border-bc-border focus-within:border-bc-accent",
          "transition-colors duration-200 ease-bc",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button type="submit" aria-label={label} className={`-ml-3 ${buttonClasses}`}>
          <SearchIcon />
        </button>
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          maxLength={80}
          autoComplete="off"
          className={inputClasses}
        />
      </form>
    );
  }

  // Variante colapsable: el ancho anima de la lupa (2.75rem) al 100% del hueco
  // reservado por el padre; el texto entra con fundido. Sin animación en
  // reduced-motion.
  return (
    <form
      ref={formRef}
      role="search"
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
      className={[
        // h-11: el área pulsable de la lupa es de 44px; el subrayado se pinta
        // aparte (span) para que el campo no parezca más alto de lo que es.
        "group/search relative flex h-11 items-center gap-1 overflow-hidden",
        // Apertura gradual (450ms), cierre más ágil (260ms): la duración la
        // marca el estado destino. ease-bc = expo ease-out.
        "transition-[width] ease-bc motion-reduce:transition-none",
        expanded ? "w-full duration-[450ms]" : "w-11 duration-[260ms]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-x-0 bottom-2 h-px",
          "transition-colors ease-bc motion-reduce:transition-none",
          expanded
            ? "bg-bc-border group-focus-within/search:bg-bc-accent duration-[450ms]"
            : "bg-transparent duration-[260ms]",
        ].join(" ")}
      />
      <button
        ref={toggleRef}
        type="button"
        aria-label={t("search")}
        aria-expanded={expanded}
        aria-controls={inputId}
        onClick={() => {
          if (!expanded) {
            openAndFocus();
          } else if (!isEmpty()) {
            submit();
            collapse(false);
          } else if (!hasFineHover()) {
            // Táctil: segundo tap con el campo vacío lo recoge.
            collapse(true);
          } else {
            // Abierto por hover: el clic enfoca el campo para escribir.
            openAndFocus();
          }
        }}
        className={buttonClasses}
      >
        <SearchIcon />
      </button>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={80}
        autoComplete="off"
        tabIndex={expanded ? 0 : -1}
        aria-hidden={!expanded}
        className={[
          inputClasses,
          "transition-opacity ease-bc motion-reduce:transition-none",
          expanded
            ? "opacity-100 duration-[320ms] delay-[140ms]"
            : "opacity-0 pointer-events-none duration-[120ms]",
        ].join(" ")}
      />
    </form>
  );
}

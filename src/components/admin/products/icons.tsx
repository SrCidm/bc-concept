/** Iconos del panel: trazo de 1,6 como el resto del admin, `currentColor`, siempre decorativos. */

const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PendingIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.25" r="1" fill="currentColor" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Giro solo con movimiento permitido; con reduced-motion queda un arco quieto. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg {...base} className={`motion-safe:animate-spin ${className}`}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Lenguaje compartido de los controles-icono del Header (lupa, cesta,
 * hamburguesa). Sin fondos ni sombreados: la interacción es que el control
 * se despliega (campo de búsqueda / etiqueta "Cesta"), no que cambie de fondo.
 * · hover → solo con puntero fino y hover real (variantes hover-fine /
 *   group-hover-fine); el color vira un punto a bc-accent
 * · :active → scale(.97) del control
 * · foco visible con ring bc-accent
 * · objetivo táctil ≥44px (size-11 / min-h-11 en cada uso)
 * · prefers-reduced-motion → sin movimiento (todo transform va con motion-safe:)
 */
export const iconControlClasses =
  "group rounded-full text-bc-text-primary select-none " +
  "transition-[color,transform] duration-[160ms] ease-bc " +
  "hover-fine:text-bc-accent " +
  "motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent";

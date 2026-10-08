/**
 * Transición de entrada entre rutas (Inicio ↔ Catálogo).
 * template.tsx se remonta en cada navegación; Header y Footer viven en el
 * layout y permanecen → sin parpadeo. Solo opacidad: el movimiento lo ponen
 * los reveals de cada sección, evitando una doble animación.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in motion-reduce:animate-none">{children}</div>;
}

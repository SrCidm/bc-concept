import { mock } from "bun:test";

// `server-only` lanza al importarse fuera de un entorno react-server (Next lo
// resuelve por condición de export). En los tests de servidor se anula.
mock.module("server-only", () => ({}));

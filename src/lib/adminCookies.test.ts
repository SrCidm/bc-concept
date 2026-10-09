import { describe, expect, test } from "bun:test";
import { ADMIN_CURTAIN_COOKIE, adminModeState } from "./adminCookies";

describe("adminModeState", () => {
  test("sin el guiño (Yosra, otras admins): ni envoltorio ni transición, con o sin cookie", () => {
    expect(adminModeState(false, false)).toEqual({ shell: false, initiallyDark: false });
    expect(adminModeState(false, true)).toEqual({ shell: false, initiallyDark: false });
  });

  test("con el guiño y sin cookie de sesión: render claro (la transición a oscuro la hace el cliente)", () => {
    expect(adminModeState(true, false)).toEqual({ shell: true, initiallyDark: false });
  });

  test("con el guiño y cookie de sesión: oscuro directo (F5 / navegación interna, sin parpadeo)", () => {
    expect(adminModeState(true, true)).toEqual({ shell: true, initiallyDark: true });
  });

  test("nombre de la cookie", () => {
    expect(ADMIN_CURTAIN_COOKIE).toBe("bc_admin_curtain");
  });
});

import { getTranslations } from "next-intl/server";
import { HeaderClient } from "./HeaderClient";

/**
 * Header — Server Component shell.
 * Fetches translations server-side and passes them as plain strings to the
 * client component, keeping the interactive bundle minimal.
 */
export async function Header() {
  const tNav = await getTranslations("nav");
  const tCommon = await getTranslations("common");

  const navItems = [
    { label: tNav("home"), href: "/" },
    { label: tNav("collection"), href: "/catalog" },
    { label: tNav("about"), href: "/sobre-nosotros" },
    { label: tNav("contact"), href: "/contacto" },
  ];

  const cartLabel = tCommon("cart", { count: 0 });
  const menuLabel = tCommon("menu");

  return (
    <HeaderClient
      navItems={navItems}
      cartLabel={cartLabel}
      menuLabel={menuLabel}
    />
  );
}

/**
 * Locale-aware navigation helpers generated from the routing config.
 * Import Link, useRouter, usePathname from here (not from next/navigation)
 * when you need locale-aware navigation.
 */
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

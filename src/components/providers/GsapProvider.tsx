"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

// Register GSAP plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

export function GsapProvider({ children }: { children: React.ReactNode }) {
  // Global GSAP configuration can go here
  useEffect(() => {
    // Refresh ScrollTrigger on route change or dynamic layout updates
    ScrollTrigger.refresh();
  }, []);

  return <>{children}</>;
}

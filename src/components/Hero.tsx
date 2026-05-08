"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Link from "next/link";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline();

    tl.to(".hero-text", {
      y: 0,
      opacity: 1,
      duration: 1,
      stagger: 0.2,
      ease: "power3.out",
    }).to(
      ".hero-button",
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: "power2.out",
      },
      "-=0.5"
    );
  }, { scope: containerRef, dependencies: [] });

  return (
    <section 
      ref={containerRef}
      className="relative w-full h-screen flex flex-col items-center justify-center bg-bc-bg-base overflow-hidden"
    >
      <div className="z-10 text-center px-4">
        <h1 
          className="hero-text opacity-0 translate-y-8 font-serif text-5xl md:text-7xl lg:text-8xl text-bc-text-primary tracking-widest mb-6"
          aria-label="B and C Concept"
        >
          B<span className="font-sans">&</span>C<span className="ml-1 md:ml-2">:</span> Concept
        </h1>
        <p className="hero-text opacity-0 translate-y-8 font-sans text-lg md:text-xl text-bc-text-muted max-w-2xl mx-auto mb-10">
          Escandinavian-Mediterranean Home Decor. Curated for a serene and elegant lifestyle.
        </p>
        <Link href="/catalog" passHref>
          <button className="hero-button opacity-0 translate-y-5 bg-bc-accent-med text-bc-bg-base font-sans px-8 py-4 uppercase tracking-widest text-sm hover:bg-bc-text-primary transition-colors duration-300 shadow-premium hover:shadow-premium-hover rounded-sm">
            Explorar Colección
          </button>
        </Link>
      </div>
      
      {/* Abstract aesthetic shapes for premium feel */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center opacity-30">
        <div className="w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full border border-bc-border-subtle absolute mix-blend-multiply" />
        <div className="w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full border border-bc-border-subtle absolute mix-blend-multiply" />
      </div>
    </section>
  );
}

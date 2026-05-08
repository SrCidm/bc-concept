import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'bc-bg-base':       '#F5F5F0',
        'bc-bg-alt':        '#EAEAE0',
        'bc-text-primary':  '#1A1A1A',
        'bc-text-muted':    '#666666',
        'bc-accent-med':    '#4A6B5D',
        'bc-accent-warm':   '#D4A373',
        'bc-border-subtle': '#D1D1C7',
        'bc-border-strong': '#1A1A1A',
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        serif: ['var(--font-playfair)', 'serif'],
      },
      boxShadow: {
        'premium': '0 4px 20px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)',
        'premium-hover': '0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 5px rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

// Palette lifted from the CVC Folks directory (doub1ejack-cvc-folks-wumv.bolt.host)
// so both apps read as one product: sage greens on a mint-white ground, with
// the logo's golden sun as the accent.
const colors = {
  leaf: "#97cf8a",
  sprout: "#b1dd9e",
  pine: "#315e26",
  moss: "#7a9f79",
  mint: "#acd1af",
  forest: "#315a39",
  sun: "#e8a317",
};

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: colors.leaf,
        "primary-foreground": "#1e4620",
        secondary: colors.sprout,
        "secondary-foreground": colors.pine,
        accent: "#e8f5e9",
        "accent-foreground": colors.forest,
        muted: "#6b8e70",
        "muted-foreground": "#f5fff4",
        background: "#f6fef9",
        surface: "#ffffff",
        foreground: "#1e4620",
        "foreground-light": "#2f5a32",
        border: "#d1e7d8",
        ring: colors.leaf,
        sun: colors.sun,
        warning: "#fbbf24",
        destructive: "#ef4444",
        "destructive-foreground": "#fffaf8"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui"],
      },
      borderRadius: {
        card: "1rem",
      },
      boxShadow: {
        soft: "0 2px 8px rgba(0, 0, 0, 0.06)",
        elev: "0 4px 16px rgba(0, 0, 0, 0.08)",
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

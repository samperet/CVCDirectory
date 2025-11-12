import type { Config } from "tailwindcss";
const colors = {
  leaf: "#97cf8a",
  sprout: "#b1dd9e",
  pine: "#315e26",
  moss: "#7a9f79",
  mint: "#acd1af",
  forest: "#315a39",
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
        "primary-foreground": "#0f2d11",
        secondary: colors.sprout,
        "secondary-foreground": colors.pine,
        accent: colors.mint,
        "accent-foreground": colors.forest,
        muted: colors.moss,
        "muted-foreground": "#f5fff4",
        background: "#f7fbf4",
        foreground: colors.forest,
        border: colors.moss,
        ring: colors.leaf,
        destructive: "#b83c2f",
        "destructive-foreground": "#fffaf8"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui"],
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(49, 90, 57, 0.35)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

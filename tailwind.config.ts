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
        cream: {
          50: "#fffdf9",
          100: "#fdf8f3",
          150: "#faf3ea",
          200: "#f0e6d8",
          300: "#e5d9c8",
          400: "#d4c4b0",
        },
        forest: {
          500: "#22804a",
          600: "#1b6b3e",
          700: "#166534",
          800: "#14532d",
          900: "#0f3d24",
        },
        leaf: {
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 24px -4px rgba(15, 61, 36, 0.08), 0 2px 8px -2px rgba(15, 61, 36, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;

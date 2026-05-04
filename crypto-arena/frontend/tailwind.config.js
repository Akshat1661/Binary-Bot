/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg:      "#0a0a1a",
          card:    "#111128",
          border:  "#1e1e3f",
          purple:  "#7c3aed",
          violet:  "#6d28d9",
          pink:    "#db2777",
          gold:    "#f59e0b",
          green:   "#10b981",
          red:     "#ef4444",
          blue:    "#3b82f6",
        },
      },
      fontFamily: { mono: ["'JetBrains Mono'", "monospace"] },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        card: "hsl(var(--card))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",
        foreground: "hsl(var(--foreground))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "lane-injected": "hsl(var(--lane-injected))",
        "lane-l1": "hsl(var(--lane-l1))",
        pass: "hsl(var(--pass))",
        fail: "hsl(var(--fail))",
        pending: "hsl(var(--pending))",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.25rem" },
    },
  },
  plugins: [],
};

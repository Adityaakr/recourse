/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        sidebar: "hsl(var(--sidebar))",
        card: "hsl(var(--card))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",
        fg: "hsl(var(--fg))",
        "muted-fg": "hsl(var(--muted-fg))",
        primary: "hsl(var(--primary))",
        "primary-ink": "hsl(var(--primary-ink))",
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
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem", "3xl": "1.5rem" },
      boxShadow: { card: "var(--shadow-sm)", float: "var(--shadow)" },
    },
  },
  plugins: [],
};

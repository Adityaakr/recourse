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
        "card-head": "hsl(var(--card-head))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",
        fg: "hsl(var(--fg))",
        "muted-fg": "hsl(var(--muted-fg))",
        accent: "hsl(var(--accent))",
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
      borderRadius: { DEFAULT: "3px", md: "4px", lg: "5px", xl: "6px", "2xl": "7px" },
    },
  },
  plugins: [],
};

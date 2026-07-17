import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No node polyfills needed — the SCALE codec and everything the browser imports
// are pure Uint8Array/Web APIs.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});

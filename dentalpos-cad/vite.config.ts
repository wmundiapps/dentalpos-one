import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: "index.html", gallery: "gallery.html" } } },
  server: { port: 5199, host: true },
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 60000 },
} as never);

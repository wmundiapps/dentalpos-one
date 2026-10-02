import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build de biblioteca (módulo embutível): npm run build:lib → dist-lib/dentalpos-cad.js
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-lib",
    lib: { entry: "src/embed.tsx", formats: ["es"], fileName: () => "dentalpos-cad.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
} as never);

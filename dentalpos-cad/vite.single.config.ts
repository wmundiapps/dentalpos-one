import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build de arquivo único (sem divisão de chunks) para embutir tudo em um HTML.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist-single", rollupOptions: { output: { inlineDynamicImports: true } }, chunkSizeWarningLimit: 4000 },
} as never);

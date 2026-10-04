import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import obfuscate from "./scripts/obfuscate-plugin.mjs";

// Build de arquivo único (sem divisão de chunks) para embutir tudo em um HTML.
export default defineConfig({
  base: "./",
  plugins: [react(), ...(process.env.OBFUSCATE === "1" ? [obfuscate()] : [])],
  build: { outDir: "dist-single", rollupOptions: { output: { inlineDynamicImports: true } }, chunkSizeWarningLimit: 4000 },
} as never);

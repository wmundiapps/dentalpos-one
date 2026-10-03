// Gera dist-single/dentalpos-cad.html: um único arquivo HTML (JS + CSS embutidos) que abre com duplo clique, sem servidor.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
execSync("npx vite build -c vite.single.config.ts", { stdio: "inherit" });
let html = readFileSync("dist-single/index.html", "utf8");
const inline = (p) => readFileSync("dist-single/" + p.replace(/^\.\//, ""), "utf8").replace(/<\/script/gi, "<\\/script");
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_, src) => `<script type="module">${inline(src)}</script>`);
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, href) => `<style>${readFileSync("dist-single/" + href.replace(/^\.\//, ""), "utf8")}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, "");
mkdirSync("dist-single", { recursive: true });
writeFileSync("dist-single/dentalpos-cad.html", html);
console.log("OK dist-single/dentalpos-cad.html", (html.length / 1048576).toFixed(2), "MB");

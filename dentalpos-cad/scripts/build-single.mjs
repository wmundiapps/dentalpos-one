// Gera dist-single/dentalpos-cad.html: um único arquivo HTML (JS + CSS embutidos) que abre com duplo clique, sem servidor.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
execSync("npx vite build -c vite.single.config.ts", { stdio: "inherit" });
let html = readFileSync("dist-single/index.html", "utf8");
const inline = (p) => readFileSync("dist-single/" + p.replace(/^\.\//, ""), "utf8").replace(/<\/script/gi, "<\\/script");
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_, src) => `<script type="module">${inline(src)}</script>`);
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, href) => `<style>${readFileSync("dist-single/" + href.replace(/^\.\//, ""), "utf8")}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, "");
// CSP: só o script embutido (por hash) roda; sem rede além da API opcional de revisão por LLM; sem objetos, formulários ou <base>.
if (process.env.VITE_HARDEN === "1") {
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const hash = createHash("sha256").update(m[1]).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash}' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src https://api.anthropic.com; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
  html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">\n    <meta name="referrer" content="no-referrer">`);
}
mkdirSync("dist-single", { recursive: true });
writeFileSync("dist-single/dentalpos-cad.html", html);
console.log("OK dist-single/dentalpos-cad.html", (html.length / 1048576).toFixed(2), "MB");

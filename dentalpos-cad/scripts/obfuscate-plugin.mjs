// Plugin Vite: ofusca o código do aplicativo (src/) na build de release. Bibliotecas (node_modules) e os pesos do modelo não são tocados.
// Código numérico pesado (src/core, src/scan) recebe ofuscação leve para não perder desempenho; interface/segurança/IA recebem a forte.
import JavaScriptObfuscator from "javascript-obfuscator";

const base = { reservedStrings: ["^nsfwjs", "^@tensorflow", "^@vladmandic"], compact: true, identifierNamesGenerator: "hexadecimal", renameGlobals: false, sourceMap: false, target: "browser", sourceType: "module", stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 0.8, stringArrayWrappersCount: 2, stringArrayWrappersType: "function", disableConsoleOutput: true, simplify: true, transformObjectKeys: false, unicodeEscapeSequence: false };
const strong = { ...base, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.45, splitStrings: true, splitStringsChunkLength: 6, selfDefending: false, debugProtection: false };
const light = { ...base, controlFlowFlattening: false, stringArrayThreshold: 0.5 };

export default function obfuscate() {
  return {
    name: "dpcad-obfuscate", enforce: "post", apply: "build",
    transform(code, id) {
      const f = id.split("?")[0].replace(/\\/g, "/");
      if (!/\/src\/.*\.(t|j)sx?$/.test(f) || f.includes("/models/weights") || f.includes("/security/nsfw") || f.endsWith(".test.ts") || f.includes("node_modules")) return null;
      const heavy = /\/src\/(core|scan)\//.test(f) || process.env.OBF_LEVEL === "light";
      const out = JavaScriptObfuscator.obfuscate(code, heavy ? light : strong).getObfuscatedCode();
      return { code: out, map: null };
    },
  };
}

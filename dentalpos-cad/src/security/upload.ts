// Validação de arquivos enviados: extensão, tamanho, assinatura ("magic bytes"), conteúdo ativo e (imagens) reencodificação + filtro de nudez.
export type UploadKind = "mesh" | "image" | "project";
export interface UploadOk { ok: true; data: ArrayBuffer; mime?: string }
export interface UploadFail { ok: false; reason: string }
export type UploadResult = UploadOk | UploadFail;

const LIMITS: Record<UploadKind, number> = { mesh: 400 * 2 ** 20, image: 30 * 2 ** 20, project: 60 * 2 ** 20 };
const EXT: Record<UploadKind, string[]> = { mesh: ["stl", "obj", "ply"], image: ["jpg", "jpeg", "png", "webp"], project: ["json", "dpcad"] };

const startsWith = (u: Uint8Array, s: string, off = 0) => { for (let i = 0; i < s.length; i++) if (u[off + i] !== s.charCodeAt(i)) return false; return true; };
const head = (u: Uint8Array, n = 1024) => new TextDecoder("latin1").decode(u.subarray(0, Math.min(n, u.length)));

/** assinaturas de executáveis/scripts/containers que nunca devem ser aceitos, qualquer que seja a extensão */
export function dangerousSignature(u: Uint8Array): string | null {
  if (startsWith(u, "MZ")) return "executável do Windows";
  if (u[0] === 0x7f && startsWith(u, "ELF", 1)) return "executável Linux";
  if ((u[0] === 0xcf || u[0] === 0xce || u[0] === 0xca) && u[1] === 0xfa) return "executável macOS";
  if (startsWith(u, "#!")) return "script";
  if (startsWith(u, "PK\x03\x04") || startsWith(u, "Rar!") || startsWith(u, "7z\xbc\xaf") || (u[0] === 0x1f && u[1] === 0x8b)) return "arquivo compactado";
  if (startsWith(u, "%PDF")) return "PDF";
  if (startsWith(u, "\xd0\xcf\x11\xe0")) return "documento Office/OLE";
  if (startsWith(u, "dex\n") || startsWith(u, "\xca\xfe\xba\xbe")) return "código compilado";
  const h = head(u, 2048).toLowerCase();
  if (/<\s*(script|html|iframe|object|embed|svg|\?php)/.test(h)) return "conteúdo ativo (HTML/SVG/script)";
  if (/(^|\n)\s*(powershell|cmd\.exe|<%|eval\()/.test(h)) return "script";
  return null;
}
const isImage = (u: Uint8Array) => (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) || (startsWith(u, "\x89PNG\r\n\x1a\n")) || (startsWith(u, "RIFF") && startsWith(u, "WEBP", 8));

function validMesh(name: string, u: Uint8Array): string | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "stl") {
    if (startsWith(u, "solid") && /facet|endsolid|vertex/.test(head(u, 4096))) return null; // ASCII
    if (u.length < 84) return "STL binário truncado.";
    const n = new DataView(u.buffer, u.byteOffset, u.byteLength).getUint32(80, true);
    if (n === 0 || 84 + n * 50 === u.length) return null; // (n=0: o importador deduz pelo tamanho)
    if ((u.length - 84) % 50 === 0) return null;
    return "Estrutura de STL inválida (tamanho não confere com o número de triângulos).";
  }
  if (ext === "ply") return startsWith(u, "ply") ? null : "PLY inválido.";
  if (ext === "obj") { const h = head(u, 4096); return /^[#vfgmousl\s]/.test(h) && /(^|\n)\s*v\s+-?[\d.]/.test(h) ? ((/[\x00-\x08\x0e-\x1f]/.test(h)) ? "OBJ contém bytes binários." : null) : "OBJ inválido."; }
  return "Extensão não permitida.";
}

/** JSON seguro: rejeita chaves de poluição de protótipo e profundidade excessiva */
export function safeParseJson(text: string): unknown {
  const v = JSON.parse(text, (k, val) => { if (k === "__proto__" || k === "constructor" || k === "prototype") throw new Error("Chave proibida no JSON."); return val; });
  const depth = (o: unknown, d = 0): number => (d > 40 ? d : o && typeof o === "object" ? Math.max(0, ...Object.values(o as object).map((x) => depth(x, d + 1))) + 1 : 0);
  if (depth(v) > 40) throw new Error("JSON profundo demais.");
  return v;
}

export async function validateUpload(file: File, kind: UploadKind): Promise<UploadResult> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!EXT[kind].includes(ext)) return { ok: false, reason: `Tipo de arquivo não permitido (.${ext}). Aceitos: ${EXT[kind].map((e) => "." + e).join(", ")}.` };
  if (file.size === 0) return { ok: false, reason: "Arquivo vazio." };
  if (file.size > LIMITS[kind]) return { ok: false, reason: `Arquivo grande demais (máx. ${Math.round(LIMITS[kind] / 2 ** 20)} MB).` };
  if (/[\x00-\x1f<>:"|?*\\/]/.test(file.name)) return { ok: false, reason: "Nome de arquivo inválido." };
  const data = await file.arrayBuffer();
  const u = new Uint8Array(data);
  const bad = dangerousSignature(u);
  if (bad) return { ok: false, reason: `Arquivo bloqueado: parece ser ${bad}.` };
  if (kind === "mesh") { const r = validMesh(file.name, u); return r ? { ok: false, reason: r } : { ok: true, data }; }
  if (kind === "project") {
    try { const o = safeParseJson(new TextDecoder().decode(u)) as { version?: number }; if (!o || typeof o !== "object" || o.version !== 1) return { ok: false, reason: "Projeto DentalPos CAD inválido." }; } catch (e) { return { ok: false, reason: `JSON inválido: ${e instanceof Error ? e.message : e}` }; }
    return { ok: true, data };
  }
  if (!isImage(u)) return { ok: false, reason: "O conteúdo não é uma imagem JPEG/PNG/WebP válida." };
  return { ok: true, data, mime: u[0] === 0xff ? "image/jpeg" : u[0] === 0x89 ? "image/png" : "image/webp" };
}

/** decodifica e redesenha a imagem (remove EXIF, perfis e dados anexados) limitando a 4096 px */
export async function sanitizeImage(data: ArrayBuffer, mime: string, maxPx = 4096): Promise<{ blob: Blob; width: number; height: number; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(new Blob([data], { type: mime }));
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao reencodar a imagem."))), "image/jpeg", 0.95));
  return { blob, width: c.width, height: c.height, canvas: c };
}

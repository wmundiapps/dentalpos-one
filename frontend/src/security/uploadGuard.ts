// Validação de arquivos no cliente ANTES do envio. É conveniência/UX: o servidor continua sendo
// a validação oficial (e responde 422 quando bloqueia por segurança).

export type TipoArquivo = "imagem" | "pdf" | "documento" | "planilha" | "stl" | "modelo3d" | "dicom" | "json";

interface Regra {
  extensoes: string[];
  mimes: string[];
}

const REGRAS: Record<TipoArquivo, Regra> = {
  imagem: {
    extensoes: ["png", "jpg", "jpeg", "webp", "gif"],
    mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  },
  pdf: { extensoes: ["pdf"], mimes: ["application/pdf"] },
  documento: {
    extensoes: ["pdf", "doc", "docx"],
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  planilha: {
    extensoes: ["xlsx", "csv"],
    mimes: ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
  },
  stl: { extensoes: ["stl"], mimes: ["model/stl", "application/sla", "application/vnd.ms-pki.stl", "application/octet-stream", "text/plain"] },
  modelo3d: { extensoes: ["stl", "ply", "obj"], mimes: ["model/stl", "application/sla", "application/octet-stream", "text/plain", "model/obj"] },
  dicom: { extensoes: ["dcm"], mimes: ["application/dicom", "application/octet-stream"] },
  json: { extensoes: ["json", "dentalpos"], mimes: ["application/json", "text/plain", "application/octet-stream"] },
};

/** Primeiros bytes (hex) esperados por extensão, para quem tem assinatura conhecida. */
const ASSINATURA_POR_EXT: Record<string, string[]> = {
  png: ["89504e47"],
  jpg: ["ffd8ff"],
  jpeg: ["ffd8ff"],
  gif: ["47494638"],
  webp: ["52494646"],
  pdf: ["25504446"],
  docx: ["504b0304"],
  xlsx: ["504b0304"],
};

/** Extensões que nunca devem ser enviadas, em qualquer posição do nome (dupla extensão). */
const PERIGOSAS = new Set([
  "exe", "dll", "bat", "cmd", "com", "scr", "msi", "msp", "pif", "cpl", "lnk", "reg", "vbs", "vbe", "wsf", "wsh",
  "ps1", "psm1", "sh", "bash", "zsh", "jar", "apk", "app", "bin", "dmg", "iso", "js", "mjs", "cjs", "jse", "ts",
  "php", "phtml", "asp", "aspx", "jsp", "cgi", "pl", "py", "rb", "hta", "html", "htm", "xhtml", "svgz", "swf",
  "docm", "xlsm", "pptm", "xlsb", "crx", "deb", "rpm",
]);

export const TAMANHO_PADRAO_MB = 10;

export interface OpcoesUpload {
  tipos: TipoArquivo[];
  /** Permite SVG (somente onde o servidor sanitiza), além dos tipos acima. */
  permitirSvg?: boolean;
  maxBytes?: number;
}

function extensoesDoNome(nome: string) {
  const partes = nome.toLowerCase().split(".").slice(1);
  return partes.map((p) => p.trim());
}

export function atributoAccept(tipos: TipoArquivo[], permitirSvg = false) {
  const lista = tipos.flatMap((t) => REGRAS[t].extensoes.map((e) => `.${e}`));
  if (permitirSvg) lista.push(".svg");
  return Array.from(new Set(lista)).join(",");
}

async function inicioDoArquivo(file: File, n = 4) {
  const buf = await file.slice(0, n).arrayBuffer();
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Retorna null quando o arquivo pode ser enviado, ou a mensagem de erro em português. */
export async function validarArquivo(file: File, opcoes: OpcoesUpload): Promise<string | null> {
  const limite = opcoes.maxBytes ?? TAMANHO_PADRAO_MB * 1024 * 1024;
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > limite) {
    return `O arquivo tem ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB e o limite é ${(limite / 1024 / 1024).toFixed(0)} MB.`;
  }

  const exts = extensoesDoNome(file.name);
  if (!exts.length) return "O arquivo precisa ter uma extensão (ex.: .pdf, .png).";
  const ultima = exts[exts.length - 1];

  if (exts.some((e) => PERIGOSAS.has(e))) {
    return exts.length > 1 && !PERIGOSAS.has(ultima)
      ? "Nome de arquivo suspeito (dupla extensão). Renomeie o arquivo ou envie o original."
      : "Este tipo de arquivo não é permitido por segurança.";
  }

  const permitidas = new Set(opcoes.tipos.flatMap((t) => REGRAS[t].extensoes));
  if (opcoes.permitirSvg) permitidas.add("svg");
  if (!permitidas.has(ultima)) {
    return `Tipo de arquivo não permitido (.${ultima}). Aceitos: ${Array.from(permitidas).map((e) => `.${e}`).join(", ")}.`;
  }

  if (file.type) {
    const mimes = new Set(opcoes.tipos.flatMap((t) => REGRAS[t].mimes));
    if (opcoes.permitirSvg) mimes.add("image/svg+xml");
    const generico = file.type === "application/octet-stream" || file.type === "text/plain";
    if (!mimes.has(file.type) && !generico) return `O conteúdo informado (${file.type}) não corresponde ao tipo permitido.`;
  }

  // Confere os primeiros bytes para tipos com assinatura conhecida (imagens, PDF, docx/xlsx).
  const assinaturas = ASSINATURA_POR_EXT[ultima];
  if (assinaturas) {
    try {
      const inicio = await inicioDoArquivo(file);
      if (!assinaturas.some((a) => inicio.startsWith(a))) {
        return "O conteúdo do arquivo não corresponde à extensão informada.";
      }
    } catch {
      // Sem leitura local: deixa o servidor decidir.
    }
  }
  return null;
}

/** Converte erro de upload do servidor em mensagem amigável (422 = bloqueio de segurança). */
export function mensagemErroUpload(status: number | undefined, mensagem?: string) {
  if (status === 422) {
    return mensagem
      ? `Arquivo bloqueado por segurança: ${mensagem}`
      : "Arquivo bloqueado por segurança. Verifique o tipo e o conteúdo do arquivo e tente novamente com outro arquivo.";
  }
  if (status === 413) return "O arquivo é grande demais para o servidor.";
  return mensagem || "Não foi possível enviar o arquivo.";
}

/** Mensagem amigável para qualquer erro lançado durante um upload (lê `status` do erro, se houver). */
export function erroDeUpload(e: unknown, padrao = "Não foi possível enviar o arquivo.") {
  const status = (e as { status?: number } | null)?.status;
  const msg = e instanceof Error ? e.message : undefined;
  return mensagemErroUpload(status, msg || padrao);
}

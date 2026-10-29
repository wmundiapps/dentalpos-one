// Utilidades de Compras e Patrimônio: arquivos autenticados (fotos/PDF), departamentos, usuários e redução de imagem.
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { itemsOf, useOptions } from "./kit";

const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
const tokenAtual = () => localStorage.getItem("dentalpos.token") || "";

export const useDepartamentos = () => useOptions("cpp-deptos", async () => itemsOf(await eduApi.get("/suprimentos/departamentos?pageSize=200&ativo=true")).map((d: any) => ({ value: d.id, label: d.nome })));
export const usePessoas = () => useOptions("cpp-pessoas", async () => itemsOf(await eduApi.get("/infraestrutura/usuarios-responsaveis")).map((u: any) => ({ value: u.id, label: `${u.nome} (${u.role})` })));
export const useCategoriasBem = () => useOptions("cpp-catbem", async () => itemsOf(await eduApi.get("/infraestrutura/categorias-bem?pageSize=200")).map((c: any) => ({ value: c.id, label: c.nome })));

/** Busca um arquivo autenticado e devolve um object URL (para <img>/<iframe>). Libera o URL ao desmontar. */
export function useBlobUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let atual: string | null = null;
    let vivo = true;
    setUrl(null);
    if (!path) return;
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tokenAtual()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => { if (vivo) { atual = URL.createObjectURL(b); setUrl(atual); } })
      .catch(() => undefined);
    return () => { vivo = false; if (atual) URL.revokeObjectURL(atual); };
  }, [path]);
  return url;
}

/** Faz uma requisição autenticada (GET/POST) e abre o resultado (PDF/SVG/HTML) em nova aba. */
export async function abrirArquivo(method: "GET" | "POST", path: string, body?: unknown): Promise<{ paginas?: string | null }> {
  const res = await fetch(`${API}/edu${path}`, { method, headers: { Authorization: `Bearer ${tokenAtual()}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || `Erro ${res.status}`); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (!window.open(url, "_blank")) throw new Error("O navegador bloqueou a nova aba.");
  return { paginas: res.headers.get("x-total-paginas") };
}

/** Baixa texto/CSV autenticado como arquivo. */
export async function baixarArquivo(path: string, nome: string) {
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${tokenAtual()}` } });
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar o arquivo.`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = nome;
  a.click();
}

/** Reduz a imagem (lado maior 1400 px, JPEG 82%) para caber no limite do envio; devolve data URL. */
export async function reduzirImagem(file: File, ladoMax = 1400): Promise<string> {
  const bmp = await createImageBitmap(file);
  const esc = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * esc);
  cv.height = Math.round(bmp.height * esc);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.82);
}

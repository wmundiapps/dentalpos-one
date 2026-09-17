export function parseBRL(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return raw;
  const s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!s) return NaN;
  const sep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const tail = sep >= 0 ? s.slice(sep + 1) : "";
  if (sep >= 0 && tail.length > 0 && tail.length <= 2) {
    return Math.round(Number(`${s.slice(0, sep).replace(/[.,]/g, "")}.${tail}`) * 100) / 100;
  }
  return Number(s.replace(/[.,]/g, ""));
}

export function formatBRL(raw: string): string {
  const n = parseBRL(raw);
  return n > 0 ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : raw;
}

export const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
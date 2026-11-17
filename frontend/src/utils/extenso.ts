// Valor em reais por extenso.
const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DE = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CE = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CE[c]);
  if (r) parts.push(r < 20 ? UN[r] : DE[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ""));
  return parts.join(" e ");
}
function inteiro(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000), milhares = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  const out: string[] = [];
  if (milhoes) out.push(`${ate999(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  if (milhares) out.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) out.push(ate999(resto));
  return out.reduce((acc, p, i) => (i === 0 ? p : acc + (i === out.length - 1 && (resto && resto < 100 || resto % 100 === 0) ? " e " : ", ") + p), "");
}
/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */
export function reaisPorExtenso(v: number): string {
  const cents = Math.round(v * 100);
  const reais = Math.floor(cents / 100), cent = cents % 100;
  const r = reais ? `${inteiro(reais)}${reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}` : "";
  const c = cent ? `${inteiro(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  return [r, c].filter(Boolean).join(" e ") || "zero real";
}


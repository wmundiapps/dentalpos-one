// Leitura de boleto bancário e de convênio (água, luz, telefone): linha digitável ou código de barras → valor, vencimento e banco.
export interface BoletoInfo { kind: "BANCARIO" | "CONVENIO"; barcode: string; digitableLine: string; amount: number | null; dueDate: string | null; bank: string | null; valid: boolean }

const BANKS: Record<string, string> = { "001": "Banco do Brasil", "003": "Banco da Amazônia", "004": "Banco do Nordeste", "033": "Santander", "041": "Banrisul", "070": "BRB", "077": "Inter", "104": "Caixa", "212": "Original", "237": "Bradesco", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú", "356": "Real", "389": "Mercantil", "422": "Safra", "623": "Pan", "655": "Votorantim", "745": "Citibank", "748": "Sicredi", "756": "Sicoob" };

const mod10 = (s: string) => { let sum = 0, w = 2; for (let i = s.length - 1; i >= 0; i--) { const p = Number(s[i]) * w; sum += p > 9 ? p - 9 : p; w = w === 2 ? 1 : 2; } return (10 - (sum % 10)) % 10; };
const mod11 = (s: string) => { let sum = 0, w = 2; for (let i = s.length - 1; i >= 0; i--) { sum += Number(s[i]) * w; w = w === 9 ? 2 : w + 1; } const dv = 11 - (sum % 11); return dv === 0 || dv === 10 || dv === 11 ? 1 : dv; };

function dueFromFactor(fator: number): string | null {
  if (fator <= 0) return null;
  const base = Date.UTC(1997, 9, 7);
  const day = 86400000;
  const now = Date.now();
  // O fator voltou para 1000 em 22/02/2025: escolhe a data (fator ou fator+9000) mais perto de hoje.
  const a = base + fator * day, b = base + (fator + 9000) * day;
  const pick = Math.abs(a - now) <= Math.abs(b - now) ? a : b;
  return new Date(pick).toISOString().slice(0, 10);
}

export function parseBoleto(raw: string): BoletoInfo | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 47) {
    const f1 = d.slice(0, 10), f2 = d.slice(10, 21), f3 = d.slice(21, 32);
    const okFields = mod10(f1.slice(0, 9)) === Number(f1[9]) && mod10(f2.slice(0, 10)) === Number(f2[10]) && mod10(f3.slice(0, 10)) === Number(f3[10]);
    const barcode = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    const okBar = mod11(barcode.slice(0, 4) + barcode.slice(5)) === Number(barcode[4]);
    const cents = Number(barcode.slice(9, 19));
    return { kind: "BANCARIO", barcode, digitableLine: d, amount: cents > 0 ? cents / 100 : null, dueDate: dueFromFactor(Number(barcode.slice(5, 9))), bank: BANKS[d.slice(0, 3)] || `Banco ${d.slice(0, 3)}`, valid: okFields && okBar && d[3] === "9" };
  }
  if (d.length === 44 && d[0] !== "8") {
    const okBar = mod11(d.slice(0, 4) + d.slice(5)) === Number(d[4]);
    const cents = Number(d.slice(9, 19));
    const line = (() => { const c1 = d.slice(0, 4) + d.slice(19, 24), c2 = d.slice(24, 34), c3 = d.slice(34, 44); return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${d[4]}${d.slice(5, 19)}`; })();
    return { kind: "BANCARIO", barcode: d, digitableLine: line, amount: cents > 0 ? cents / 100 : null, dueDate: dueFromFactor(Number(d.slice(5, 9))), bank: BANKS[d.slice(0, 3)] || `Banco ${d.slice(0, 3)}`, valid: okBar && d[3] === "9" };
  }
  if ((d.length === 48 || d.length === 44) && d[0] === "8") {
    let barcode = d;
    let valid = true;
    if (d.length === 48) {
      const useMod10 = d[2] === "6" || d[2] === "7";
      barcode = "";
      for (let i = 0; i < 4; i++) {
        const blk = d.slice(i * 12, i * 12 + 11), dv = Number(d[i * 12 + 11]);
        if ((useMod10 ? mod10(blk) : mod11(blk)) !== dv) valid = false;
        barcode += blk;
      }
    }
    const cents = Number(barcode.slice(4, 15));
    return { kind: "CONVENIO", barcode, digitableLine: d.length === 48 ? d : "", amount: cents > 0 ? cents / 100 : null, dueDate: null, bank: null, valid };
  }
  return null;
}

const MONEY = /(?<![\d.,])\d{1,3}(?:\.\d{3})*,\d{2}(?![\d,])/g;
export const toMoney = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

/** Procura no texto do PDF a linha digitável ou o código de barras. Só aceita o que está no formato do boleto (com pontuação ou com exatos 44/47/48 dígitos): varrer qualquer número do documento gerava "boletos" falsos com valor absurdo. */
export function findBoletoInText(text: string): BoletoInfo | null {
  const t = text.replace(/\u00a0/g, " ");
  const tries: RegExp[] = [
    /\d{5}[.\s]?\d{5}\s+\d{5}[.\s]?\d{6}\s+\d{5}[.\s]?\d{6}\s+\d\s+\d{14}/g, // bancário formatado
    /\b8\d{10}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\b/g, // convênio formatado
    /(?<!\d)\d{47}(?!\d)/g,
    /(?<!\d)8\d{47}(?!\d)/g,
    /(?<!\d)\d{44}(?!\d)/g,
  ];
  let fallback: BoletoInfo | null = null;
  for (const re of tries) {
    for (const m of t.matchAll(re)) {
      const p = parseBoleto(m[0]);
      if (p?.valid) return p;
      if (p && !fallback) fallback = p;
    }
  }
  return fallback;
}

/** Valores em reais que aparecem escritos no documento (para conferir com o valor do código). */
export function findMoneyInText(text: string): number[] {
  return [...new Set([...text.matchAll(MONEY)].map((m) => toMoney(m[0])).filter((v) => v > 0))];
}

/** Valor rotulado como "Valor do documento"/"Valor cobrado"/"(=) Valor" no texto. */
export function findLabeledAmount(text: string): number | null {
  const flat = text.replace(/\s+/g, " ");
  const m = /(?:\(=\)\s*)?Valor\s+(?:do\s+Documento|Cobrado|do\s+T[ií]tulo|a\s+Pagar)\D{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i.exec(flat);
  return m ? toMoney(m[1]) : null;
}

const LABEL_WORDS = /^(valor|vencimento|ag[eê]ncia|nosso|data|cpf|cnpj|c[oó]digo|n[uú]mero|documento|esp[eé]cie|aceite|carteira|local|uso|pagador|sacado|autentica)/i;
export function findPayee(text: string): string {
  const flat = text.replace(/\s+/g, " ");
  for (const m of flat.matchAll(/(?:Nome do )?(?:Benefici[aá]rio|Cedente|Raz[aã]o Social)\s*:?\s*(.{3,100}?)(?=\s+(?:CNPJ|CPF|Ag[eê]ncia|C[oó]digo|Vencimento|Valor|Nosso|\d{2}\.\d{3}\.\d{3})|$)/gi)) {
    const v = m[1].trim().replace(/^[:\-–\s]+/, "");
    if (v.length >= 3 && !LABEL_WORDS.test(v)) return v;
  }
  return "";
}

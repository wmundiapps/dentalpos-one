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
    return { kind: "BANCARIO", barcode, digitableLine: d, amount: cents > 0 ? cents / 100 : null, dueDate: dueFromFactor(Number(barcode.slice(5, 9))), bank: BANKS[d.slice(0, 3)] || `Banco ${d.slice(0, 3)}`, valid: okFields && okBar };
  }
  if (d.length === 44 && d[0] !== "8") {
    const okBar = mod11(d.slice(0, 4) + d.slice(5)) === Number(d[4]);
    const cents = Number(d.slice(9, 19));
    const line = (() => { const c1 = d.slice(0, 4) + d.slice(19, 24), c2 = d.slice(24, 34), c3 = d.slice(34, 44); return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${d[4]}${d.slice(5, 19)}`; })();
    return { kind: "BANCARIO", barcode: d, digitableLine: line, amount: cents > 0 ? cents / 100 : null, dueDate: dueFromFactor(Number(d.slice(5, 9))), bank: BANKS[d.slice(0, 3)] || `Banco ${d.slice(0, 3)}`, valid: okBar };
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

/** Procura no texto de um PDF/e-mail a primeira linha digitável ou código de barras válido. */
export function findBoletoInText(text: string): BoletoInfo | null {
  const found: BoletoInfo[] = [];
  for (const m of text.matchAll(/\d[\d.\s-]{38,64}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    for (const len of [47, 48, 44]) {
      for (let i = 0; i + len <= digits.length && i < 8; i++) { const p = parseBoleto(digits.slice(i, i + len)); if (p?.valid) return p; if (p) found.push(p); }
    }
  }
  return found[0] || null;
}

export function findPayee(text: string): string {
  const m = /(Benefici[aá]rio|Cedente)\s*:?\s*(.{3,90}?)(?=\s+(CNPJ|CPF|Ag[eê]ncia|C[oó]digo|Vencimento|\d{2}\.\d{3}\.\d{3})|$)/i.exec(text.replace(/\s+/g, " "));
  return m ? m[2].trim() : "";
}

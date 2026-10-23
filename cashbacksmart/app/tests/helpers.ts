/** Gera CPF e CNPJ válidos e únicos para testes */
export function genCPF(seed: number) {
  const d = String(300000000 + seed * 7919).slice(0, 9).split('').map(Number);
  const dv = (a: number[]) => { const s = a.reduce((acc, n, i) => acc + n * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(d)); d.push(dv(d));
  return d.join('');
}
export function genCNPJ(seed: number) {
  const base = String(10000000 + seed * 7).slice(0, 8) + '0001';
  const d = base.split('').map(Number);
  const dv = (a: number[]) => {
    const w = a.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = a.reduce((s, n, i) => s + n * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv(d)); d.push(dv(d));
  return d.join('');
}
/** Monta uma chave de NFC-e válida (44 dígitos) para o CNPJ e mês informados */
export function genNfceKey(cnpj: string, yymm: string, number: number, uf = '41') {
  const k43 = uf + yymm + cnpj + '65' + '001' + String(number).padStart(9, '0') + '1' + String(10000000 + number).slice(-8);
  let sum = 0, w = 2;
  for (let i = k43.length - 1; i >= 0; i--) { sum += Number(k43[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = sum % 11;
  return k43 + String(r < 2 ? 0 : 11 - r);
}
export function yymmOf(d: Date) {
  const s = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return s.slice(2, 4) + s.slice(5, 7);
}

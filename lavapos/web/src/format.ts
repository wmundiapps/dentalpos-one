export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dmy = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const hm = (iso: string) => iso.slice(11, 16);
export const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const addDaysIso = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const weekday = (d: string) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(d + 'T12:00:00Z').getUTCDay()]!;
export const onlyDigits = (s: string) => s.replace(/\D/g, '');
export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export const maskPlate = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
export const waLink = (phone: string, text: string) => `https://wa.me/${onlyDigits(phone)}?text=${encodeURIComponent(text)}`;
export const FREQ_LABEL: Record<string, string> = { semanal: 'Semanal (a cada 7 dias)', quinzenal: 'Quinzenal (a cada 14 dias)', trisemanal: 'Trisemanal (a cada 21 dias)', mensal: 'Mensal (a cada 30 dias)' };
export const CAT_LABEL: Record<string, string> = { carro: 'Carro', suv: 'SUV', utilitario: 'Utilitários', van: 'Vans', caminhao: 'Caminhões' };
export const CATS = ['carro', 'suv', 'utilitario', 'van', 'caminhao'] as const;
export type Cat = (typeof CATS)[number];

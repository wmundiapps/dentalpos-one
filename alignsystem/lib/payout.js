// Data de pagamento das consultas pagas por atendimento (modelo rede e consultas avulsas/excedentes):
// atendimento registrado até o último dia útil do mês → dia 10 do mês seguinte; registrado depois → dia 10 do segundo mês seguinte.
// Ex.: registrado até o último dia útil de outubro → 10/11; registrado em 01/11 → 10/12.
// Dia útil: segunda a sexta, sem feriados nacionais (fixos e os ligados à Páscoa).

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

function holidays(y) {
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${y}-${md}`);
  const e = easter(y).getTime();
  const rel = [-48, -47, -2, 60].map((days) => new Date(e + days * 86400000).toISOString().slice(0, 10)); // carnaval (2 dias), sexta-feira santa, Corpus Christi
  return new Set([...fixed, ...rel]);
}

export function isBusinessDay(y, m, d) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(y).has(ymd(y, m, d));
}

export function lastBusinessDay(y, m) {
  let d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  while (!isBusinessDay(y, m, d)) d--;
  return d;
}

// Data (AAAA-MM-DD) no horário de Brasília
export function brDate(when) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(when));
}

export function payoutDate(registeredAt) {
  const [y, m, d] = brDate(registeredAt).split('-').map(Number);
  const add = d <= lastBusinessDay(y, m) ? 1 : 2;
  const t = new Date(Date.UTC(y, m - 1 + add, 10));
  return t.toISOString().slice(0, 10);
}

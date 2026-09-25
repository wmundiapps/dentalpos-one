// Países → estados/províncias/regiões → cidades (shared/geo/<país>.json).
// Brasil: lista oficial do IBGE (5.570 municípios). Demais países: base aberta
// countries-states-cities-database (dr5hn). Cada cidade tem o fuso horário.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface GeoState { code: string; name: string; type: string }
interface RawCountry { country: string; label: string; tz: string[]; states: Array<GeoState & { tz: number; cities: string }> }
interface Country { label: string; states: GeoState[]; cities: Map<string, Array<{ name: string; tz: string }>>; stateTz: Map<string, string> }

const dir = fileURLToPath(new URL('../../shared/geo/', import.meta.url));
const cache = new Map<string, Country | null>();

export const normalizePlace = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** JSON bruto (enviado à web). */
export function rawGeo(cc: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(cc)) return undefined;
  try { return fs.readFileSync(`${dir}${cc}.json`, 'utf8'); } catch { return undefined; }
}

function load(cc: string): Country | null {
  if (cache.has(cc)) return cache.get(cc)!;
  const raw = rawGeo(cc);
  let c: Country | null = null;
  if (raw) {
    const d = JSON.parse(raw) as RawCountry;
    c = { label: d.label, states: d.states.map(({ code, name, type }) => ({ code, name, type })), cities: new Map(), stateTz: new Map() };
    for (const s of d.states) {
      const tz = d.tz[s.tz];
      c.stateTz.set(s.code, tz);
      c.cities.set(s.code, s.cities.split('|').filter(Boolean).map((item) => {
        const [name, t] = item.split('~');
        return { name, tz: t === undefined ? tz : d.tz[Number(t)] };
      }));
    }
  }
  cache.set(cc, c);
  return c;
}

export const hasGeo = (cc: string) => !!load(cc);
export const geoState = (cc: string, code: string) => load(cc)?.states.find((s) => s.code === code);

/** Cidade oficial no estado (sem diferença de acento/maiúsculas). */
export function geoCity(cc: string, stateCode: string, name: string): { name: string; tz: string } | undefined {
  const n = normalizePlace(name);
  return load(cc)?.cities.get(stateCode)?.find((c) => normalizePlace(c.name) === n);
}

export const stateTimezone = (cc: string, code: string) => load(cc)?.stateTz.get(code);

/** Estado de uma cidade pelo nome (primeira ocorrência) — usado para dados antigos/demonstração. */
export function findStateOfCity(cc: string, city: string): string | undefined {
  const c = load(cc);
  if (!c) return undefined;
  const n = normalizePlace(city.split(' ').pop() ?? city);
  const full = normalizePlace(city);
  for (const [code, list] of c.cities) if (list.some((x) => normalizePlace(x.name) === full || normalizePlace(x.name) === n)) return code;
  return undefined;
}

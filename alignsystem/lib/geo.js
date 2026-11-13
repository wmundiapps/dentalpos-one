// Localização aproximada por município (coordenadas do IBGE) e distâncias até os dentistas credenciados.
import { readFileSync } from 'node:fs';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
export const RADIUS_KM = 300; // raio de atendimento com deslocamento por conta do paciente
export const TRIPS = 4; // deslocamentos presenciais considerados no preço
const ROAD_FACTOR = 1.25; // distância em linha reta → estimativa rodoviária

let DATA = null;
const data = () => (DATA ??= JSON.parse(readFileSync(new URL('./data/municipios.json', import.meta.url), 'utf8')));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const citiesOf = (uf) => data().filter((c) => c[1] === uf).map((c) => c[0]);

// Aceita "Maringá", "Maringá/PR", "Maringá - PR" (com UF à parte ou embutida)
export function findCity(name, uf) {
  let n = String(name || '');
  let u = String(uf || '').toUpperCase();
  const m = n.match(/^(.*?)[\s]*[/\-–,][\s]*([A-Za-z]{2})\s*$/);
  if (m && UFS.includes(m[2].toUpperCase())) { n = m[1]; u = u || m[2].toUpperCase(); }
  const k = norm(n);
  if (!k) return null;
  const hits = data().filter((c) => norm(c[0]) === k && (!u || c[1] === u));
  if (hits.length !== 1) return null; // ambíguo (mesmo nome em vários estados) ou não encontrado
  const [cn, cu, lat, lon] = hits[0];
  return { name: cn, uf: cu, lat, lon };
}

export function roadKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * ROAD_FACTOR);
}

// Passagem de ônibus convencional (ida e volta) estimada por km; ajustável na Vercel (BUS_FARE_PER_KM)
export const busFarePerKm = () => Number(process.env.BUS_FARE_PER_KM) || 0.3;
export const roundTripFare = (km) => Math.round(km * 2 * busFarePerKm() * 100) / 100;

// Dentista credenciado mais próximo de uma cidade
export function nearestDentist(city, dentists) {
  let best = null;
  for (const d of dentists) {
    const loc = findCity(d.city, d.cro_uf);
    if (!loc) continue;
    const km = roadKm(city, loc);
    if (!best || km < best.km) best = { id: d.id, city: loc.name, uf: loc.uf, km };
  }
  return best;
}

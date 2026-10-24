// Identidade visual e contato do salão: tipo de espaço, cores, textos e redes. Fica em salons.brand_json.profile.
import { HttpError, normalizePhone, json } from './util.js';

export const MODES = ['masc', 'fem', 'mix'];
export const MODE_LABEL = { masc: 'Barbearia', fem: 'Studio feminino', mix: 'Barbearia e Studio' };

// menu = cor do menu lateral; accent = cor de destaque (botões, links e letras); bg = fundo das telas.
export const DEFAULT_COLORS = {
  masc: { menu: '#14110f', accent: '#c9a66b', bg: '#f7f3ec' },   // preto com letras em ouro
  fem: { menu: '#f8dbe4', accent: '#c4527a', bg: '#fdf3f6' },    // rosa claro
  mix: { menu: '#1d1719', accent: '#c98f7f', bg: '#f9f2ef' },    // grafite com rosé
};

const HEX = /^#[0-9a-f]{6}$/i;

// Serviços sugeridos para começar (o salão edita preços e tempos depois).
export const STARTER = {
  masc: [
    ['Corte masculino', 'Cabelo', 45, 4000], ['Barba completa', 'Barba', 30, 3500], ['Corte + Barba', 'Cabelo', 70, 6500],
    ['Pigmentação e camuflagem', 'Tinturas', 50, 7000], ['Alisamento masculino', 'Alisamentos', 90, 12000],
    ['Prótese capilar (aplicação)', 'Prótese', 120, 35000], ['Avaliação de implante capilar', 'Medicina integrada', 40, 20000],
    ['Limpeza de pele', 'Esteticista', 60, 13000], ['Avaliação de harmonização facial', 'Harmonização', 60, 20000],
  ],
  fem: [
    ['Corte feminino', 'Cabelos', 60, 9000], ['Escova', 'Cabelos', 45, 6000], ['Hidratação', 'Cabelos', 50, 8000],
    ['Mega Hair (aplicação)', 'Mega Hair', 180, 45000], ['Alisamento', 'Cabelos', 150, 25000], ['Permanente', 'Cabelos', 150, 23000],
    ['Tintura', 'Cabelos', 120, 16000], ['Maquiagem', 'Maquiagem', 60, 15000], ['Manicure (mãos)', 'Unhas', 45, 4000],
    ['Pedicure (pés)', 'Unhas', 50, 5000], ['Limpeza de pele', 'Pele', 60, 14000], ['Massagem relaxante', 'Spa', 60, 16000],
    ['Avaliação de toxina botulínica', 'Pele', 45, 15000], ['Avaliação de harmonização facial', 'Pele', 60, 20000], ['Dia da Noiva', 'Noivas', 360, 180000],
  ],
};
STARTER.mix = [...STARTER.masc.slice(0, 3), ...STARTER.fem.slice(0, 3), STARTER.fem[6], STARTER.fem[8], STARTER.fem[10], STARTER.masc[7]];

// Ciclo de retorno sugerido (dias) por categoria; o salão ajusta em Serviços e equipe.
export const RECALL_BY_CATEGORY = { Cabelo: 25, Cabelos: 35, Barba: 18, Tinturas: 40, Tintura: 45, Alisamentos: 90, Unhas: 20, 'Mega Hair': 75, Pele: 30, Esteticista: 30, Spa: 30, Maquiagem: 0, Noivas: 0, 'Prótese': 45, 'Medicina integrada': 0, 'Harmonização': 180 };

export function defaultsFor(mode) { return { ...(DEFAULT_COLORS[mode] || DEFAULT_COLORS.masc) }; }

// Perfil efetivo (com padrões) lido do salão.
export function profileOf(salon) {
  const p = json(salon.brand_json, {}).profile || {};
  const mode = MODES.includes(p.mode) ? p.mode : 'masc';
  const d = defaultsFor(mode);
  const c = p.colors || {};
  return {
    mode,
    colors: { menu: HEX.test(c.menu) ? c.menu : d.menu, accent: HEX.test(c.accent) ? c.accent : d.accent, bg: HEX.test(c.bg) ? c.bg : d.bg },
    custom_colors: !!(p.colors && Object.keys(p.colors).length),
    tagline: p.tagline || '', about: p.about || '',
    whatsapp: p.whatsapp || '', instagram: p.instagram || '', facebook: p.facebook || '', website: p.website || '',
  };
}

const handle = (v, max = 40) => {
  const s = String(v || '').trim().replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '').split(/[/?#]/)[0];
  if (!s) return '';
  if (!/^[A-Za-z0-9._-]+$/.test(s) || s.length > max) throw new HttpError(422, 'Usuário de rede social inválido. Use só letras, números, ponto e sublinhado.');
  return s;
};

// Valida e funde as alterações recebidas no perfil atual.
export function mergeProfile(salon, input) {
  const cur = json(salon.brand_json, {}).profile || {};
  const next = { ...cur };
  if (input.mode !== undefined) {
    if (!MODES.includes(input.mode)) throw new HttpError(422, 'Tipo de espaço inválido.');
    if (input.mode !== next.mode && input.colors === undefined) delete next.colors; // trocar o tipo volta às cores padrão do novo tipo
    next.mode = input.mode;
  }
  if (input.colors !== undefined) {
    if (input.colors === null) delete next.colors;
    else {
      const out = {};
      for (const k of ['menu', 'accent', 'bg']) {
        if (input.colors[k] === undefined) continue;
        if (!HEX.test(String(input.colors[k]))) throw new HttpError(422, 'Cor inválida. Use o formato #RRGGBB.');
        out[k] = String(input.colors[k]).toLowerCase();
      }
      next.colors = { ...(cur.colors || {}), ...out };
    }
  }
  const text = (k, max) => { if (input[k] !== undefined) { const v = String(input[k] ?? '').trim(); if (v.length > max) throw new HttpError(422, `Texto muito longo (máximo ${max} caracteres).`); next[k] = v; } };
  text('tagline', 90); text('about', 400);
  if (input.whatsapp !== undefined) {
    const raw = String(input.whatsapp || '').trim();
    if (!raw) next.whatsapp = '';
    else { const p = normalizePhone(raw); if (!p) throw new HttpError(422, 'WhatsApp inválido. Informe com DDD.'); next.whatsapp = p; }
  }
  if (input.instagram !== undefined) next.instagram = handle(input.instagram, 30);
  if (input.facebook !== undefined) next.facebook = handle(input.facebook, 50);
  if (input.website !== undefined) {
    const w = String(input.website || '').trim();
    if (!w) next.website = '';
    else {
      let u; try { u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`); } catch { throw new HttpError(422, 'Endereço do site inválido.'); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(422, 'Endereço do site inválido.');
      next.website = u.toString().slice(0, 200);
    }
  }
  return next;
}

// Dados de contato e identidade que a página pública mostra.
export function publicBrand(salon) {
  const p = profileOf(salon);
  return {
    mode: p.mode, mode_label: MODE_LABEL[p.mode], colors: p.colors, tagline: p.tagline, about: p.about,
    contact: {
      whatsapp: p.whatsapp || null, phone: salon.phone || null, email: salon.email || null,
      instagram: p.instagram || null, facebook: p.facebook || null, website: p.website || null,
      address: salon.address || null, city: salon.city || null,
    },
  };
}

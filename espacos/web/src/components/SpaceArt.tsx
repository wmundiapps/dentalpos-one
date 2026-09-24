import { CATEGORY_ICONS } from '../../../shared/rules';
import type { SpaceCategory } from '../../../shared/types';

const PALETTES = [
  ['#0e7c7b', '#17bebb'], ['#3d5a80', '#98c1d9'], ['#6d597a', '#b56576'], ['#e07a5f', '#f2cc8f'],
  ['#2a9d8f', '#e9c46a'], ['#264653', '#2a9d8f'], ['#5f0f40', '#9a031e'], ['#386641', '#a7c957'],
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Ilustração gerada quando o anúncio não tem fotos.
export function SpaceArt({ id, category, photo, variant = 0 }: { id: string; category: SpaceCategory; photo?: string; variant?: number }) {
  if (photo) return <img className="space-art" src={photo} alt="" loading="lazy" />;
  const h = hash(id) + variant;
  const [a, b] = PALETTES[h % PALETTES.length];
  const gid = `g${h}`;
  return (
    <svg className="space-art" viewBox="0 0 400 300" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${gid})`} />
      <rect x="0" y="210" width="400" height="90" fill="#000" opacity="0.08" />
      <rect x={40 + (h % 60)} y="60" width="110" height="90" rx="6" fill="#fff" opacity="0.18" />
      <rect x={230 - (h % 40)} y="50" width="120" height="120" rx="6" fill="#fff" opacity="0.12" />
      <text x="200" y="185" fontSize="96" textAnchor="middle">{CATEGORY_ICONS[category]}</text>
    </svg>
  );
}

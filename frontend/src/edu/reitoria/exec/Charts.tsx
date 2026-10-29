import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

// Gráficos simples em SVG (sem dependências): barras agrupadas, linhas e pizza. Responsivos via viewBox.
export interface SerieDef { chave: string; titulo: string; tipo: "barra" | "linha" | "pizza"; unidade?: string; rotulos: string[]; dados: Array<{ nome: string; valores: Array<number | null> }> }

export const PALETA = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export function fmtUn(v: number | null | undefined, un?: string) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (un === "R$") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const n = v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return un === "%" ? `${n}%` : n;
}
const curto = (v: number, un?: string) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmtUn(v, un === "R$" ? undefined : un));
const cortar = (s: string, n = 10) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function Legenda({ nomes }: { nomes: string[] }) {
  if (nomes.length < 2) return null;
  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 0.5 }}>
      {nomes.map((n, i) => (
        <Box key={n} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: PALETA[i % PALETA.length] }} />
          <Typography variant="caption">{n}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function Barras({ s }: { s: SerieDef }) {
  const W = 640, H = 220, pad = { l: 44, r: 8, t: 10, b: 46 };
  const max = Math.max(1, ...s.dados.flatMap((d) => d.valores.map((v) => v ?? 0)));
  const n = s.rotulos.length, g = s.dados.length;
  const bw = (W - pad.l - pad.r) / Math.max(1, n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={s.titulo} style={{ display: "block" }}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - f)} y2={pad.t + (H - pad.t - pad.b) * (1 - f)} stroke="#e2e8f0" />
          <text x={pad.l - 4} y={pad.t + (H - pad.t - pad.b) * (1 - f) + 4} fontSize="10" textAnchor="end" fill="#64748b">{curto(max * f, s.unidade)}</text>
        </g>
      ))}
      {s.rotulos.map((r, i) => (
        <g key={i}>
          {s.dados.map((d, j) => {
            const v = d.valores[i] ?? 0;
            const h = ((H - pad.t - pad.b) * Math.max(0, v)) / max;
            const w = (bw * 0.8) / g;
            return (
              <rect key={j} x={pad.l + i * bw + bw * 0.1 + j * w} y={H - pad.b - h} width={Math.max(1, w - 1)} height={h} rx={2} fill={PALETA[j % PALETA.length]}>
                <title>{`${r} — ${d.nome}: ${fmtUn(d.valores[i], s.unidade)}`}</title>
              </rect>
            );
          })}
          <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 14} fontSize="10" textAnchor="middle" fill="#475569">{cortar(r, n > 8 ? 6 : 12)}</text>
        </g>
      ))}
    </svg>
  );
}

function Linhas({ s }: { s: SerieDef }) {
  const W = 640, H = 220, pad = { l: 44, r: 8, t: 10, b: 30 };
  const todos = s.dados.flatMap((d) => d.valores.filter((v): v is number => v != null));
  const max = Math.max(1, ...todos), min = Math.min(0, ...todos);
  const n = s.rotulos.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : ((W - pad.l - pad.r) * i) / (n - 1));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={s.titulo} style={{ display: "block" }}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={y(min + (max - min) * f)} y2={y(min + (max - min) * f)} stroke="#e2e8f0" />
          <text x={pad.l - 4} y={y(min + (max - min) * f) + 4} fontSize="10" textAnchor="end" fill="#64748b">{curto(min + (max - min) * f, s.unidade)}</text>
        </g>
      ))}
      {s.dados.map((d, j) => {
        const pts = d.valores.map((v, i) => (v == null ? null : [x(i), y(v)] as const));
        const path = pts.reduce((acc, p, i) => (p ? acc + `${acc && pts[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} ` : acc), "");
        return (
          <g key={j}>
            <path d={path} fill="none" stroke={PALETA[j % PALETA.length]} strokeWidth={2.2} />
            {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={PALETA[j % PALETA.length]}><title>{`${s.rotulos[i]} — ${d.nome}: ${fmtUn(d.valores[i], s.unidade)}`}</title></circle>)}
          </g>
        );
      })}
      {s.rotulos.map((r, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) && <text key={i} x={x(i)} y={H - 10} fontSize="10" textAnchor="middle" fill="#475569">{cortar(r, 9)}</text>)}
    </svg>
  );
}

function Pizza({ s }: { s: SerieDef }) {
  const valores = s.rotulos.map((r, i) => ({ r, v: s.dados[0]?.valores[i] ?? 0 })).filter((x) => x.v > 0);
  const total = valores.reduce((a, b) => a + b.v, 0);
  if (!total) return <Typography color="text.secondary" variant="body2">Sem dados.</Typography>;
  let ang = -Math.PI / 2;
  const R = 70, cx = 80, cy = 80;
  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label={s.titulo}>
        {valores.length === 1 ? <circle cx={cx} cy={cy} r={R} fill={PALETA[0]} /> : valores.map((x, i) => {
          const a0 = ang, a1 = ang + (x.v / total) * Math.PI * 2;
          ang = a1;
          const big = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M${cx},${cy} L${cx + R * Math.cos(a0)},${cy + R * Math.sin(a0)} A${R},${R} 0 ${big} 1 ${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)} Z`;
          return <path key={i} d={d} fill={PALETA[i % PALETA.length]} stroke="#fff" strokeWidth={1}><title>{`${x.r}: ${fmtUn(x.v, s.unidade)}`}</title></path>;
        })}
      </svg>
      <Box>
        {valores.map((x, i) => (
          <Box key={x.r} sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: PALETA[i % PALETA.length] }} />
            <Typography variant="caption">{x.r}: <b>{fmtUn(x.v, s.unidade)}</b> ({Math.round((x.v / total) * 100)}%)</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function Grafico({ serie }: { serie: SerieDef }) {
  const vazio = useMemo(() => serie.dados.every((d) => d.valores.every((v) => !v)), [serie]);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>{serie.titulo}</Typography>
      {vazio && serie.tipo !== "pizza" ? <Typography color="text.secondary" variant="body2">Sem dados no período.</Typography> : serie.tipo === "pizza" ? <Pizza s={serie} /> : serie.tipo === "linha" ? <Linhas s={serie} /> : <Barras s={serie} />}
      {serie.tipo !== "pizza" && <Legenda nomes={serie.dados.map((d) => d.nome)} />}
    </Box>
  );
}

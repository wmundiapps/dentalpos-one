import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { useMemo, useRef, useState } from "react";
import { TIPO_COR, papelLabel } from "./common";

export interface DNo { id: string; titulo: string; tipo: string; papel?: string | null; fase?: string | null; slaDias?: number | null; modulo?: string | null; rota?: string | null; camada: number; linha: number; estado?: string }
export interface DAresta { id: string; de: string; para: string; rotulo?: string | null; condicional: boolean; retorno: boolean }
export interface DDiagrama { nos: DNo[]; arestas: DAresta[]; raias?: Array<{ papel: string; nos: number }> }

const NW = 168, NH = 56, GX = 56, GY = 18, LANE_LABEL = 130, PAD = 16;
const ESTADO_COR: Record<string, string> = { CONCLUIDA: "#16a34a", PULADA: "#16a34a", ABERTA: "#2563eb", AGUARDANDO_EVENTO: "#2563eb", ATRASADA: "#dc2626" };
const ESTADO_LABEL: Record<string, string> = { PENDENTE: "Pendente", CONCLUIDA: "Concluída", PULADA: "Pulada", ABERTA: "Em andamento", AGUARDANDO_EVENTO: "Aguardando evento", ATRASADA: "Atrasada" };

function quebra(t: string, max = 24): string[] {
  const words = t.split(/\s+/); const lines: string[] = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, max - 1) + "…"; }
  return lines;
}

/** Fluxograma em SVG com raias por papel. Sem dependências. */
export default function FlowDiagram({ diagrama, height = 520 }: { diagrama: DDiagrama; height?: number }) {
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<DNo | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const g = useMemo(() => {
    const nos = diagrama.nos || [];
    const lanes = [...new Set(nos.map((n) => n.papel || ""))];
    // ordem das raias: pelo menor camada em que aparecem
    lanes.sort((a, b) => Math.min(...nos.filter((n) => (n.papel || "") === a).map((n) => n.camada)) - Math.min(...nos.filter((n) => (n.papel || "") === b).map((n) => n.camada)));
    const stack = new Map<string, number>(); // lane|camada -> qtd
    const idxInCell = new Map<string, number>();
    const sorted = [...nos].sort((a, b) => a.camada - b.camada || a.linha - b.linha);
    for (const n of sorted) {
      const k = `${n.papel || ""}|${n.camada}`; const i = stack.get(k) || 0; stack.set(k, i + 1); idxInCell.set(n.id, i);
    }
    const laneRows = lanes.map((l) => Math.max(1, ...[...stack.entries()].filter(([k]) => k.startsWith(`${l}|`)).map(([, v]) => v)));
    const laneH = laneRows.map((r) => r * (NH + GY) + GY + 8);
    const laneY: number[] = []; let acc = PAD;
    laneH.forEach((h) => { laneY.push(acc); acc += h; });
    const camadas = Math.max(1, ...nos.map((n) => n.camada + 1));
    const W = LANE_LABEL + camadas * (NW + GX) + PAD;
    const H = acc + PAD;
    const pos = new Map<string, { x: number; y: number; n: DNo }>();
    for (const n of nos) {
      const li = lanes.indexOf(n.papel || "");
      pos.set(n.id, { x: LANE_LABEL + GX / 2 + n.camada * (NW + GX), y: laneY[li] + GY + 4 + (idxInCell.get(n.id) || 0) * (NH + GY), n });
    }
    return { lanes, laneH, laneY, W, H, pos };
  }, [diagrama]);

  function fit() {
    const w = boxRef.current?.clientWidth || 800;
    setZoom(Math.max(0.3, Math.min(1.2, (w - 8) / g.W)));
  }

  const edges = diagrama.arestas.map((e) => {
    const A = g.pos.get(e.de), B = g.pos.get(e.para);
    if (!A || !B) return null;
    let d: string; let lx: number; let ly: number;
    if (B.n.camada <= A.n.camada) {
      // retorno: contorna por baixo
      const y = Math.max(A.y, B.y) + NH + 10;
      const x1 = A.x + NW / 2, x2 = B.x + NW / 2;
      d = `M ${x1} ${A.y + NH} C ${x1} ${y + 14}, ${x2} ${y + 14}, ${x2} ${B.y + NH}`;
      lx = (x1 + x2) / 2; ly = y + 12;
    } else {
      const x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2;
      const mx = (x1 + x2) / 2;
      d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      lx = mx; ly = (y1 + y2) / 2 - 4;
    }
    return { e, d, lx, ly };
  });

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap", alignItems: "center", rowGap: 1 }}>
        <Tooltip title="Reduzir"><IconButton size="small" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}><ZoomOutIcon /></IconButton></Tooltip>
        <Typography variant="body2" sx={{ minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</Typography>
        <Tooltip title="Ampliar"><IconButton size="small" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))}><ZoomInIcon /></IconButton></Tooltip>
        <Tooltip title="Ajustar à largura"><IconButton size="small" onClick={fit}><FitScreenIcon /></IconButton></Tooltip>
        {Object.entries(TIPO_COR).map(([k, c]) => (
          <Chip key={k} size="small" label={c.label} sx={{ bgcolor: c.fill, border: `1px solid ${c.stroke}`, fontWeight: 600 }} />
        ))}
      </Stack>
      <Paper variant="outlined" ref={boxRef}
        onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoom((z) => Math.min(2.5, Math.max(0.3, +(z + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))); } }}
        sx={{ overflow: "auto", maxHeight: height, borderRadius: 3, bgcolor: "background.default" }}>
        <svg width={g.W * zoom} height={g.H * zoom} viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label="Fluxograma da jornada" style={{ display: "block" }}>
          <defs>
            <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker>
            <marker id="seta-ret" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" /></marker>
          </defs>
          {g.lanes.map((l, i) => (
            <g key={l || "geral"}>
              <rect x={0} y={g.laneY[i]} width={g.W} height={g.laneH[i]} fill={i % 2 ? "rgba(100,116,139,.07)" : "rgba(100,116,139,.02)"} stroke="rgba(100,116,139,.35)" />
              <rect x={0} y={g.laneY[i]} width={LANE_LABEL - 10} height={g.laneH[i]} fill="rgba(100,116,139,.18)" />
              <text x={(LANE_LABEL - 10) / 2} y={g.laneY[i] + g.laneH[i] / 2} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={700} fill="currentColor">{papelLabel(l)}</text>
            </g>
          ))}
          {edges.map((x) => x && (
            <g key={x.e.id}>
              <path d={x.d} fill="none" stroke={x.e.retorno ? "#dc2626" : "#64748b"} strokeWidth={1.6} strokeDasharray={x.e.condicional || x.e.retorno ? "5 3" : undefined} markerEnd={`url(#${x.e.retorno ? "seta-ret" : "seta"})`} />
              {x.e.rotulo ? <text x={x.lx} y={x.ly} textAnchor="middle" fontSize={10} fill="#475569" stroke="#fff" strokeWidth={3} paintOrder="stroke">{x.e.rotulo}</text> : null}
            </g>
          ))}
          {[...g.pos.values()].map(({ x, y, n }) => {
            const c = TIPO_COR[n.tipo] || TIPO_COR.TAREFA;
            const est = n.estado && n.estado !== "PENDENTE" ? ESTADO_COR[n.estado] : undefined;
            const stroke = est || c.stroke;
            const fill = n.estado === "CONCLUIDA" || n.estado === "PULADA" ? "#bbf7d0" : n.estado === "ATRASADA" ? "#fecaca" : c.fill;
            const dim = diagrama.nos.some((z) => z.estado) && (!n.estado || n.estado === "PENDENTE") ? 0.55 : 1;
            const linhas = quebra(n.titulo, n.tipo === "GATEWAY" ? 18 : 24);
            const cx = x + NW / 2, cy = y + NH / 2;
            let shape;
            if (n.tipo === "GATEWAY") shape = <polygon points={`${cx},${y} ${x + NW},${cy} ${cx},${y + NH} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={est ? 3 : 1.6} />;
            else if (n.tipo === "INICIO" || n.tipo === "FIM") shape = <rect x={x} y={y} width={NW} height={NH} rx={NH / 2} fill={fill} stroke={stroke} strokeWidth={est ? 3 : 1.6} />;
            else if (n.tipo === "MARCO") shape = <ellipse cx={cx} cy={cy} rx={NW / 2} ry={NH / 2} fill={fill} stroke={stroke} strokeWidth={est ? 3 : 1.6} />;
            else if (n.tipo === "ESPERA_EVENTO") shape = <polygon points={`${x + 14},${y} ${x + NW},${y} ${x + NW - 14},${y + NH} ${x},${y + NH}`} fill={fill} stroke={stroke} strokeWidth={est ? 3 : 1.6} />;
            else if (n.tipo === "APROVACAO") shape = <polygon points={`${x + 14},${y} ${x + NW - 14},${y} ${x + NW},${cy} ${x + NW - 14},${y + NH} ${x + 14},${y + NH} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={est ? 3 : 1.6} />;
            else shape = <rect x={x} y={y} width={NW} height={NH} rx={8} fill={fill} stroke={stroke} strokeWidth={est ? 3 : 1.6} />;
            const y0 = cy - ((linhas.length - 1) * 7) - (n.slaDias != null && n.tipo !== "GATEWAY" ? 4 : 0);
            return (
              <g key={n.id} opacity={dim} style={{ cursor: "pointer" }} onClick={() => setSel(n)}>
                <title>{`${n.titulo} — ${TIPO_COR[n.tipo]?.label || n.tipo}${n.slaDias != null ? ` · SLA ${n.slaDias}d` : ""}${n.estado ? ` · ${ESTADO_LABEL[n.estado] || n.estado}` : ""}`}</title>
                {shape}
                {linhas.map((t, i) => <text key={i} x={cx} y={y0 + i * 14} textAnchor="middle" dominantBaseline="middle" fontSize={11.5} fontWeight={600} fill="#0f172a">{t}</text>)}
                {n.slaDias != null && n.tipo !== "GATEWAY" ? <text x={cx} y={y + NH - 9} textAnchor="middle" fontSize={9.5} fill="#475569">SLA {n.slaDias}d</text> : null}
              </g>
            );
          })}
        </svg>
      </Paper>
      {sel && (
        <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 800 }}>{sel.titulo}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
            <Chip size="small" label={TIPO_COR[sel.tipo]?.label || sel.tipo} />
            <Chip size="small" variant="outlined" label={`Raia: ${papelLabel(sel.papel)}`} />
            {sel.fase ? <Chip size="small" variant="outlined" label={`Fase: ${sel.fase}`} /> : null}
            {sel.slaDias != null ? <Chip size="small" variant="outlined" label={`SLA ${sel.slaDias} dia(s)`} /> : null}
            {sel.modulo ? <Chip size="small" variant="outlined" label={`Módulo: ${sel.modulo}`} /> : null}
            {sel.estado ? <Chip size="small" color={sel.estado === "ATRASADA" ? "error" : sel.estado === "CONCLUIDA" ? "success" : "default"} label={ESTADO_LABEL[sel.estado] || sel.estado} /> : null}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

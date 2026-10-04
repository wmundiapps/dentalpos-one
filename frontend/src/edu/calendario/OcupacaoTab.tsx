import { Alert, Box, MenuItem, Paper, TextField, Tooltip, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { qsOf } from "../../services/EduApi";
import { Card, heat, Row, useGet, useTerms } from "./kit";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const pct = (v: number) => `${Math.round((v || 0) * 100)}%`;

export default function OcupacaoTab() {
  const terms = useTerms();
  const [termId, setTermId] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const { data, loading, error } = useGet<any>(termId ? `/calendario/relatorios/ocupacao${qsOf({ termId, detalhe: "true", dias: "1,2,3,4,5,6" })}` : null);
  const itens: any[] = data?.itens || [];

  // ocupação agregada por dia × horário (fração de espaços ocupados)
  const agg = useMemo(() => {
    const horas = new Map<string, { dia: string; hora: string; n: number; t: number }>();
    itens.forEach((i) => (i.mapa || []).forEach((m: any) => {
      const k = `${m.dia}|${m.inicio}`; const x = horas.get(k) || { dia: m.dia, hora: `${m.inicio}–${m.fim}`, n: 0, t: 0 };
      x.t++; if (m.ocupado) x.n++; horas.set(k, x);
    }));
    const rows = [...new Set([...horas.values()].map((x) => x.hora))].sort();
    return { horas, rows };
  }, [itens]);
  const sele = itens.find((i) => i.spaceId === sel);
  const selRows = useMemo(() => [...new Set((sele?.mapa || []).map((m: any) => `${m.inicio}–${m.fim}`))].sort() as string[], [sele]);

  return (
    <Box>
      <Row>
        <TextField select size="small" label="Período letivo" value={termId} onChange={(e) => { setTermId(e.target.value); setSel(null); }} sx={{ minWidth: 240 }}>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
      </Row>
      {!termId ? <Alert severity="info">Selecione o período letivo para ver a ocupação dos espaços.</Alert> : null}
      {error ? <Alert severity="warning">Não foi possível carregar a ocupação: {error}. (Relatório restrito à gestão e infraestrutura.)</Alert> : null}
      {loading && termId ? <Typography color="text.secondary">Carregando...</Typography> : null}
      {data ? (
        <>
          <Row>
            <Card label="Espaços" value={data.resumo?.espacos ?? 0} /><Card label="Ocupação média" value={pct(data.resumo?.taxaMediaOcupacao)} color="#7c3aed" />
            <Card label="Espaços ociosos" value={data.resumo?.espacosOciosos ?? 0} color="#f59e0b" /><Card label="Sem nenhuma aula" value={data.resumo?.espacosSemNenhumaAula ?? 0} color="#dc2626" />
          </Row>
          {!itens.length ? <Alert severity="info">Nenhum espaço com dados de ocupação.</Alert> : (
            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" } }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, overflowX: "auto" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Mapa de calor por espaço e dia (clique para detalhar)</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: `minmax(150px, 1.4fr) repeat(${DIAS.length}, minmax(52px, 1fr)) 64px`, gap: "2px", minWidth: 560 }}>
                  <Box />{DIAS.map((d) => <Typography key={d} variant="caption" sx={{ textAlign: "center", fontWeight: 700 }}>{d.slice(0, 3)}</Typography>)}<Typography variant="caption" sx={{ textAlign: "center", fontWeight: 700 }}>Total</Typography>
                  {itens.map((i) => (
                    <Box key={i.spaceId} sx={{ display: "contents", cursor: "pointer" }} onClick={() => setSel(i.spaceId)}>
                      <Typography variant="caption" noWrap sx={{ alignSelf: "center", fontWeight: sel === i.spaceId ? 800 : 400 }} title={i.nome}>{i.codigo ? `${i.codigo} — ` : ""}{i.nome}</Typography>
                      {DIAS.map((d) => <Tooltip key={d} title={`${i.nome} · ${d}: ${pct(i.porDia?.[d])}`}><Box sx={{ bgcolor: heat(i.porDia?.[d] ?? 0), borderRadius: 0.5, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, outline: sel === i.spaceId ? "2px solid #2563eb" : "none" }}>{pct(i.porDia?.[d])}</Box></Tooltip>)}
                      <Box sx={{ bgcolor: heat(i.taxaOcupacao), borderRadius: 0.5, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{pct(i.taxaOcupacao)}</Box>
                    </Box>
                  ))}
                </Box>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, overflowX: "auto" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{sele ? `Detalhe: ${sele.nome}` : "Ocupação geral por horário"}</Typography>
                {(() => {
                  const rows = sele ? selRows : agg.rows;
                  const val = (d: string, h: string) => {
                    if (sele) { const m = (sele.mapa || []).find((x: any) => x.dia === d && `${x.inicio}–${x.fim}` === h); return m ? (m.ocupado ? 1 : 0) : null; }
                    const x = [...agg.horas.values()].find((y) => y.dia === d && y.hora === h); return x ? x.n / (x.t || 1) : null;
                  };
                  return (
                    <Box sx={{ display: "grid", gridTemplateColumns: `78px repeat(${DIAS.length}, minmax(34px, 1fr))`, gap: "2px", minWidth: 340 }}>
                      <Box />{DIAS.map((d) => <Typography key={d} variant="caption" sx={{ textAlign: "center", fontWeight: 700 }}>{d.slice(0, 3)}</Typography>)}
                      {rows.map((h) => (
                        <Box key={h} sx={{ display: "contents" }}>
                          <Typography variant="caption" sx={{ alignSelf: "center" }}>{h}</Typography>
                          {DIAS.map((d) => { const v = val(d, h); return <Tooltip key={d} title={v == null ? "Fora da malha" : sele ? (v ? "Ocupado" : "Livre") : `${pct(v)} dos espaços ocupados`}><Box sx={{ height: 24, borderRadius: 0.5, bgcolor: v == null ? "action.disabledBackground" : heat(v), opacity: v == null ? 0.4 : 1 }} /></Tooltip>; })}
                        </Box>
                      ))}
                    </Box>
                  );
                })()}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                  <Typography variant="caption">Livre</Typography>
                  {[0, 0.25, 0.5, 0.75, 1].map((v) => <Box key={v} sx={{ width: 26, height: 12, bgcolor: heat(v), borderRadius: 0.5 }} />)}
                  <Typography variant="caption">Lotado</Typography>
                </Box>
              </Paper>
            </Box>
          )}
          {(data.ociosos || []).length ? (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Espaços ociosos (abaixo de {pct(data.limiarOciosidade)})</Typography>
              <Typography variant="body2" color="text.secondary">{data.ociosos.slice(0, 15).map((o: any) => `${o.codigo || o.nome} (${pct(o.taxaOcupacao)})`).join(" · ")}</Typography>
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

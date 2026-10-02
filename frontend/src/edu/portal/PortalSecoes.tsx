import { Alert, Box, Button, Chip, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Empty, Progress, Status, fmtDate, fmtDateTime, fmtMoney, fmtNum } from "../secretaria/util";
import { Semaforo, SituacaoChip } from "../notas/GradeNotas";

export function Card({ title, icon, children, action, accent }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode; accent?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 4, height: "100%", borderTop: accent ? `4px solid ${accent}` : undefined }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        {icon}
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

export function Kpi({ title, value, hint, color }: { title: string; value: ReactNode; hint?: string; color: string }) {
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 4, bgcolor: `${color}14`, border: `1px solid ${color}40` }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color, textTransform: "uppercase", letterSpacing: ".05em" }}>{title}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

export function NotasCard({ notas, onRevisao, podeAgir }: { notas: any; onRevisao: (a: { classSectionId: string; codigo: string; titulo: string }) => void; podeAgir: boolean }) {
  const ds: any[] = notas?.disciplinas || [];
  if (!ds.length) return <Empty>Sem disciplinas no período atual.</Empty>;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {(notas.alertas || []).map((a: any, i: number) => <Alert key={i} severity={a.nivel === "ALTO" ? "error" : "warning"}><b>{a.disciplina}:</b> {(a.motivos || []).join(" · ")}</Alert>)}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
        {ds.map((d) => {
          const fp = d.frequenciaPct;
          return (
            <Paper key={d.classSectionId} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Semaforo nivel={d.risco} />
                <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 800 }} noWrap>{d.disciplina}</Typography><Typography variant="caption" color="text.secondary">{d.professor || "Professor a definir"}</Typography></Box>
                <SituacaoChip v={d.situacao} />
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", my: 1 }}>
                {(d.componentes || []).map((c: any) => {
                  const ok = c.valor != null;
                  return podeAgir && ok ? (
                    <Chip key={c.codigo} size="small" clickable variant="outlined" label={`${c.codigo}: ${fmtNum(c.valor)}`} title="Clique para solicitar revisão" onClick={() => onRevisao({ classSectionId: d.classSectionId, codigo: c.codigo, titulo: `${d.disciplina} — ${c.nome} (${fmtNum(c.valor)})` })} />
                  ) : <Chip key={c.codigo} size="small" variant="outlined" label={`${c.codigo}: ${c.ausente ? "Aus." : ok ? fmtNum(c.valor) : "—"}`} />;
                })}
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <Box><Typography variant="caption">Média parcial <b>{fmtNum(d.mediaParcial)}</b>{d.mediaFinal != null ? ` · final ${fmtNum(d.mediaFinal)}` : ""}</Typography><Progress value={((d.mediaParcial ?? 0) / 10) * 100} color={d.mediaParcial == null ? "primary" : d.mediaParcial >= 7 ? "success" : d.mediaParcial >= 5 ? "warning" : "error"} /></Box>
                <Box><Typography variant="caption">Frequência <b>{fp != null ? `${fmtNum(fp, 0)}%` : "—"}</b>{d.faltas ? ` · ${d.faltas} falta(s)` : ""}</Typography><Progress value={fp ?? 0} color={fp == null ? "primary" : fp < 75 ? "error" : fp < 82 ? "warning" : "success"} /></Box>
              </Box>
              {d.notaNecessaria != null && d.situacao === "EM_CURSO" && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>Para ser aprovado, você precisa de <b>{fmtNum(d.notaNecessaria)}</b> na próxima avaliação.</Typography>}
            </Paper>
          );
        })}
      </Box>
      {podeAgir && <Typography variant="caption" color="text.secondary">Dica: clique em uma nota para pedir revisão.</Typography>}
    </Box>
  );
}

export function FinanceiroCard({ fin }: { fin: any }) {
  if (!fin) return <Typography color="text.secondary">Informações financeiras indisponíveis no momento.</Typography>;
  const prox = fin.proximoVencimento;
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Chip color={fin.emDia ? "success" : "error"} label={fin.emDia ? "Situação financeira em dia" : `${fin.qtdVencidas} parcela(s) vencida(s) — ${fmtMoney(fin.totalVencido)}`} sx={{ justifySelf: "start", fontWeight: 700 }} />
      <Typography variant="body2">Total em aberto: <b>{fmtMoney(fin.totalEmAberto)}</b></Typography>
      {prox && <Typography variant="body2">Próximo vencimento: <b>{fmtDate(prox.vencimento)}</b> — {fmtMoney(prox.valor)}</Typography>}
      {(fin.itens || []).slice(0, 5).map((i: any) => (
        <Box key={i.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.25, borderBottom: "1px dashed", borderColor: "divider" }}>
          <Typography variant="body2" noWrap sx={{ flex: 1 }}>{i.descricao}{i.parcela ? ` (${i.parcela})` : ""}</Typography>
          <Typography variant="body2" color={i.vencida ? "error.main" : "text.primary"}>{fmtDate(i.vencimento)} · {fmtMoney(i.valor)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export function ProvasCard({ provas, aulas }: { provas: any[]; aulas: any[] }) {
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {!provas?.length && <Typography color="text.secondary" variant="body2">Nenhuma prova agendada.</Typography>}
      {(provas || []).slice(0, 6).map((p, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <Box sx={{ minWidth: 54, textAlign: "center", bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 2, py: 0.5 }}>
            <Typography variant="h6" sx={{ lineHeight: 1 }}>{new Date(p.inicio).getDate()}</Typography>
            <Typography variant="caption">{new Date(p.inicio).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{p.titulo}</Typography><Typography variant="caption" color="text.secondary">{p.turma || ""} · {fmtDateTime(p.inicio)}</Typography></Box>
        </Box>
      ))}
      {(aulas || []).length > 0 && <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Próximas aulas</Typography>}
      {(aulas || []).slice(0, 5).map((a) => <Typography key={a.id} variant="body2">{fmtDateTime(a.dataHoraInicio)} · {a.turma || a.titulo}{a.local ? ` · ${a.local}` : ""}</Typography>)}
    </Box>
  );
}

export function AvisosCard({ avisos }: { avisos: any }) {
  const l: any[] = avisos?.lembretes || [];
  const n: any[] = avisos?.notificacoes || [];
  if (!l.length && !n.length) return <Typography color="text.secondary" variant="body2">Nenhum aviso por enquanto.</Typography>;
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {l.slice(0, 4).map((x) => <Alert key={x.id} severity={x.severity === "CRITICA" ? "error" : x.severity === "ATENCAO" ? "warning" : "info"} sx={{ py: 0 }}><b>{x.titulo}</b>{x.dueAt ? ` · até ${fmtDate(x.dueAt)}` : ""}</Alert>)}
      {n.slice(0, 5).map((x) => (
        <Box key={x.id} sx={{ borderLeft: "3px solid", borderColor: x.lidaEm ? "divider" : "primary.main", pl: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: x.lidaEm ? 500 : 800 }}>{x.assunto}</Typography>
          <Typography variant="caption" color="text.secondary">{fmtDate(x.createdAt)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export function RequerimentosCard({ lista, revisoes, onNovo, podeAgir }: { lista: any[]; revisoes: any[]; onNovo: () => void; podeAgir: boolean }) {
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {podeAgir && <Button variant="contained" size="small" onClick={onNovo} sx={{ justifySelf: "start" }}>Novo requerimento</Button>}
      {!lista?.length && <Typography color="text.secondary" variant="body2">Nenhum requerimento em andamento.</Typography>}
      {(lista || []).map((r) => (
        <Box key={r.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{r.numero} · {r.assunto}</Typography><Typography variant="caption" color="text.secondary">prazo {fmtDate(r.prazoEm)}</Typography></Box>
          <Status value={r.status} />
        </Box>
      ))}
      {(revisoes || []).length > 0 && <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Revisões de nota</Typography>}
      {(revisoes || []).map((r) => <Box key={r.id} sx={{ display: "flex", justifyContent: "space-between" }}><Typography variant="body2">Aberta em {fmtDate(r.criadoEm)}</Typography><Status value={r.status} /></Box>)}
    </Box>
  );
}

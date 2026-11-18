import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, useLoad, useToast } from "../admissoes/common";
import { Pill, dt } from "./ui";

const TIPO: Record<string, string> = { POP: "Procedimentos Operacionais Padrão (POP)", INSTRUCAO: "Instruções de trabalho", MANUAL: "Manuais de serviço", TREINAMENTO: "Treinamentos", REGRA: "Regras do serviço e do setor" };

/** Visão do próprio colaborador: a quem se reportar, declarações, documentos de trabalho, treinamentos, EPIs e escalonamento por demanda. */
export default function ColaboradorPortal() {
  const { data, loading, error, reload } = useLoad<any>("/colaborador/meu");
  const { setMsg, node } = useToast();
  const [ver, setVer] = useState<any>(null);
  const [decl, setDecl] = useState<any>(null);
  async function ciencia(d: any) { try { await eduApi.post(`/colaborador/meu/ciencia/${d.id}`); setMsg({ type: "success", text: "Registrado: você deu ciência." }); reload(); setVer(null); } catch (e: any) { setMsg({ type: "error", text: e.message }); } }
  async function pedir(d: any) { try { setDecl(await eduApi.post("/colaborador/meu/declaracoes", { documentoId: d.id })); reload(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } }
  async function receber(e: any) { try { await eduApi.post(`/colaborador/meu/epis/${e.id}/ciencia`); setMsg({ type: "success", text: "Recebimento confirmado." }); reload(); } catch (x: any) { setMsg({ type: "error", text: x.message }); } }
  return (
    <StateBox loading={loading} error={error} onRetry={reload}>
      {data && !data.colaborador ? <Alert severity="info">{data.mensagem}</Alert> : data && (
        <>
          <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
            <Stat label="Colaborador" value={data.colaborador.nome} hint={`${data.colaborador.cargo ?? "—"} · matrícula ${data.colaborador.matricula}`} />
            <Stat label="Setor" value={data.colaborador.departamento ?? "—"} hint={`Admissão: ${dt(data.colaborador.admissao)}`} />
            <Stat label="Pendências obrigatórias" value={data.pendentes} color={data.pendentes ? "#B45309" : "#15803D"} hint="documentos e treinamentos sem ciência" />
            <Stat label="EPIs para retirar" value={data.epiPendentes} color={data.epiPendentes ? "#B45309" : "#15803D"} hint="ainda não entregues a você" />
          </Stack>

          <Section title="A quem me reportar" description="Sua cadeia hierárquica, do gestor direto para cima.">
            <Stack direction={{ xs: "column", md: "row" }} alignItems="center" gap={1} flexWrap="wrap">
              <Chip label={`Você: ${data.colaborador.nome}`} color="primary" />
              {data.hierarquia.map((h: any) => (<Stack key={h.id} direction="row" alignItems="center" gap={1}><ArrowDownwardIcon fontSize="small" sx={{ transform: "rotate(-90deg)" }} /><Chip variant="outlined" label={`${h.nome}${h.cargo ? ` · ${h.cargo}` : ""}`} /></Stack>))}
              {!data.hierarquia.length && <Typography color="text.secondary">Gestor direto ainda não informado. Procure o RH.</Typography>}
            </Stack>
            {data.escalonamento.length > 0 && (
              <Box sx={{ mt: 2, display: "grid", gap: 1, gridTemplateColumns: { md: "repeat(2, 1fr)" } }}>
                {[...new Set(data.escalonamento.map((e: any) => e.demanda))].map((dem: any) => (
                  <Paper key={dem} variant="outlined" sx={{ p: 1.5 }}>
                    <Typography sx={{ fontWeight: 700 }}>{dem}</Typography>
                    {data.escalonamento.filter((e: any) => e.demanda === dem).map((e: any) => <Typography key={e.id} variant="body2">{e.nivel}º: {e.responsavel}{e.cargo ? ` (${e.cargo})` : ""}{e.contato ? ` — ${e.contato}` : ""}</Typography>)}
                  </Paper>
                ))}
              </Box>
            )}
          </Section>

          <Section title="Minhas declarações" description="Peça e imprima a declaração de que precisar; ela é emitida na hora com seus dados.">
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {data.documentos.filter((d: any) => d.tipo === "DECLARACAO").map((d: any) => <Button key={d.id} variant="outlined" onClick={() => pedir(d)}>{d.titulo}</Button>)}
            </Stack>
            {data.solicitacoes.map((s: any) => (<Stack key={s.id} direction="row" gap={1} alignItems="center" sx={{ py: .5 }}><Pill v={s.status} /><Typography sx={{ flex: 1 }}>{s.titulo} — {dt(s.solicitadoEm)}</Typography><Button size="small" onClick={() => setDecl(s)}>Ver / imprimir</Button></Stack>))}
          </Section>

          {Object.keys(TIPO).map((t) => {
            const lista = data.documentos.filter((d: any) => d.tipo === t);
            if (!lista.length) return null;
            return (
              <Section key={t} title={TIPO[t]}>
                {lista.map((d: any) => (
                  <Stack key={d.id} direction="row" gap={1} alignItems="center" sx={{ py: .75, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{d.titulo}{d.duracaoHoras ? ` · ${d.duracaoHoras} h` : ""}</Typography>
                      {d.descricao && <Typography variant="body2" color="text.secondary">{d.descricao}</Typography>}
                    </Box>
                    {d.obrigatorio && !d.cienteEm && <Chip size="small" color={d.vencido ? "error" : "warning"} label={d.vencido ? "Atrasado" : "Obrigatório"} />}
                    {d.cienteEm ? <Chip size="small" color="success" label={`Ciente em ${dt(d.cienteEm)}`} /> : <Button size="small" variant="contained" onClick={() => setVer(d)}>Abrir e dar ciência</Button>}
                    {d.cienteEm && <Button size="small" onClick={() => setVer(d)}>Reler</Button>}
                  </Stack>
                ))}
              </Section>
            );
          })}

          <Section title="Meus EPIs" description="Equipamentos de proteção individual do seu cargo e se você já retirou.">
            {data.epis.length === 0 ? <Typography color="text.secondary">Nenhum EPI definido para você.</Typography> : data.epis.map((e: any) => (
              <Stack key={e.id} direction="row" gap={1} alignItems="center" sx={{ py: .75, borderBottom: "1px solid", borderColor: "divider" }}>
                <Pill v={e.status === "PENDENTE" ? "PENDENTE" : e.status} />
                <Typography sx={{ flex: 1 }}><b>{e.epi}</b>{e.ca ? ` · ${e.ca}` : ""}{e.tamanho ? ` · tam. ${e.tamanho}` : ""}</Typography>
                <Typography variant="body2" color="text.secondary">{e.status === "PENDENTE" ? "Você ainda NÃO retirou este EPI — procure o almoxarifado." : `Entregue em ${dt(e.entregueEm)}${e.validadeAte ? ` · troca até ${dt(e.validadeAte)}` : ""}`}</Typography>
                {e.status === "ENTREGUE" && !e.cienteEm && <Button size="small" variant="outlined" onClick={() => receber(e)}>Confirmar recebimento</Button>}
              </Stack>
            ))}
          </Section>
        </>
      )}
      <Dialog open={!!ver} onClose={() => setVer(null)} fullWidth maxWidth="md">
        <DialogTitle>{ver?.titulo}</DialogTitle>
        <DialogContent dividers><Typography sx={{ whiteSpace: "pre-line" }}>{ver?.conteudo || ver?.descricao || "Conteúdo disponível no link abaixo."}</Typography>{ver?.url && ver.url !== "#" && <Button href={ver.url} target="_blank" sx={{ mt: 2 }}>Abrir material</Button>}</DialogContent>
        <DialogActions><Button onClick={() => setVer(null)}>Fechar</Button>{ver && !ver.cienteEm && <Button variant="contained" onClick={() => ciencia(ver)}>Li e estou ciente</Button>}</DialogActions>
      </Dialog>
      <Dialog open={!!decl} onClose={() => setDecl(null)} fullWidth maxWidth="sm">
        <DialogTitle>{decl?.titulo}</DialogTitle>
        <DialogContent dividers><Typography sx={{ whiteSpace: "pre-line" }}>{decl?.textoEmitido}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setDecl(null)}>Fechar</Button><Button variant="contained" onClick={() => window.print()}>Imprimir</Button></DialogActions>
      </Dialog>
      {node}
    </StateBox>
  );
}

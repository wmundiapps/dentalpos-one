import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper, Typography,
} from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Loadable, Section, Semaforo, fmtD, nameOf, usePolos, usePrograms, useAsync } from "./kit";

const BASE = "/modalidades";

function Checklist({ poloId, nome, onClose }: { poloId: string; nome: string; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(() => eduApi.get(`${BASE}/polos/${poloId}/checklist`), [poloId]);
  const [err, setErr] = useState<string | null>(null);
  async function toggle(it: any, atendido: boolean) {
    try { await eduApi.put(`${BASE}/polos/${poloId}/checklist/${it.chave}`, { atendido }); reload(); } catch (e: any) { setErr(e.message); }
  }
  const r = data?.resumo;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Checklist de estrutura — {nome}</DialogTitle>
      <DialogContent dividers>
        <Loadable loading={loading} error={error}>
          {r ? (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">{r.obrigatoriosAtendidos}/{r.obrigatoriosTotal} itens obrigatórios · {r.percentual}% {r.apto ? "— apto ao credenciamento" : ""}</Typography>
              <LinearProgress variant="determinate" value={r.percentual} color={r.apto ? "success" : "primary"} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
          ) : null}
          {err ? <Alert severity="error" sx={{ mb: 1 }} onClose={() => setErr(null)}>{err}</Alert> : null}
          {(data?.items || []).map((it: any) => (
            <FormControlLabel key={it.chave} sx={{ display: "flex" }} control={<Checkbox checked={!!it.atendido} onChange={(e) => toggle(it, e.target.checked)} />} label={`${it.titulo}${it.obrigatorio ? " *" : ""}`} />
          ))}
          {!(data?.items || []).length ? <Typography color="text.secondary">Sem itens. Use “Aplicar padrões” na aba Conformidade.</Typography> : null}
        </Loadable>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

/** Polos de apoio presencial: cadastro, credenciamento, indicadores, checklist e ofertas. */
export default function PolosTab() {
  const ind = useAsync(() => eduApi.get(`${BASE}/polos-indicadores`), []);
  const [chk, setChk] = useState<{ id: string; nome: string } | null>(null);
  const polos = usePolos(); const cursos = usePrograms();
  const lista: any[] = Array.isArray(ind.data) ? ind.data : [];
  const corOc = (s: string) => (s === "SUPERLOTADO" ? "error" : s === "LOTADO" ? "warning" : s === "OCIOSO" ? "inherit" : "primary");

  return (
    <Box>
      <Section title="Indicadores dos polos" hint="Ocupação, estrutura, relação aluno/tutor e risco de evasão.">
        <Loadable loading={ind.loading} error={ind.error}>
          {lista.length ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" }, gap: 2 }}>
              {lista.map((x) => (
                <Paper key={x.polo.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Typography sx={{ fontWeight: 800, flex: 1 }} noWrap>{x.polo.nome}</Typography>
                    <StatusChip value={x.polo.status} />
                  </Box>
                  <Typography variant="caption">Ocupação: {x.ocupacao.ocupados}/{x.ocupacao.capacidade} ({x.ocupacao.percentual}%) — {x.ocupacao.status}</Typography>
                  <LinearProgress variant="determinate" value={Math.min(100, x.ocupacao.percentual)} color={corOc(x.ocupacao.status) as any} sx={{ height: 8, borderRadius: 4, mb: 1 }} />
                  <Typography variant="caption">Estrutura: {x.estrutura.percentual}% dos itens obrigatórios</Typography>
                  <LinearProgress variant="determinate" value={x.estrutura.percentual} color={x.estrutura.apto ? "success" : "warning"} sx={{ height: 8, borderRadius: 4, mb: 1 }} />
                  <Box sx={{ display: "flex", gap: 0.7, flexWrap: "wrap", mb: 1 }}>
                    <Chip size="small" label={`${x.cursosOfertados} curso(s) · ${x.vagasOfertadas} vagas`} />
                    <Chip size="small" color={x.pctRiscoEvasao > 20 ? "error" : "default"} label={`Risco de evasão ${x.pctRiscoEvasao}%`} />
                    {x.atendimentos90d?.slaCumpridoPct != null ? <Chip size="small" label={`SLA ${x.atendimentos90d.slaCumpridoPct}%`} /> : null}
                    {x.atoVencendo ? <Chip size="small" color="warning" label={`Ato vence ${fmtD(x.polo.atoValidade)}`} /> : null}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Semaforo nivel={x.atoVencendo || !x.estrutura.apto ? "atencao" : x.ocupacao.status === "SUPERLOTADO" ? "critico" : "ok"} label={`Tutoria: ${x.tutoria?.status || "—"}`} />
                    <Button size="small" onClick={() => setChk({ id: x.polo.id, nome: x.polo.nome })}>Checklist</Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          ) : <Typography color="text.secondary">Nenhum polo ativo cadastrado.</Typography>}
        </Loadable>
      </Section>

      <EduResourcePage title="Polos" base={BASE} resource="/polos" dense
        filters={[{ key: "statusCredenciamento", label: "Credenciamento", options: ["EM_CREDENCIAMENTO", "CREDENCIADO", "SUSPENSO", "DESCREDENCIADO"] }]}
        columns={[
          { key: "codigo", label: "Código" }, { key: "nome", label: "Polo" }, { key: "cidade", label: "Cidade", render: (r) => [r.cidade, r.uf].filter(Boolean).join("/") || "—" },
          { key: "capacidade", label: "Capacidade" }, { key: "atoValidade", label: "Ato válido até", render: (r) => fmtD(r.atoValidade) },
          { key: "statusCredenciamento", label: "Credenciamento", render: (r) => <StatusChip value={r.statusCredenciamento} /> },
        ]}
        fields={[
          { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true },
          { key: "responsavelNome", label: "Responsável" }, { key: "responsavelEmail", label: "E-mail do responsável" }, { key: "responsavelTelefone", label: "Telefone" },
          { key: "cep", label: "CEP" }, { key: "logradouro", label: "Logradouro" }, { key: "numero", label: "Número" }, { key: "bairro", label: "Bairro" },
          { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF (2 letras)" }, { key: "capacidade", label: "Capacidade (alunos)", type: "number" },
          { key: "atoNumero", label: "Ato de credenciamento (nº)" }, { key: "atoData", label: "Data do ato", type: "date" }, { key: "atoValidade", label: "Validade do ato", type: "date" },
          { key: "ativo", label: "Ativo", type: "bool" },
        ]}
        rowActions={[
          { label: "Credenciar", path: "/polos/:id/credenciar", color: "success", confirm: "Credenciar este polo? Exige checklist obrigatório completo.", hidden: (r) => r.statusCredenciamento === "CREDENCIADO" },
          { label: "Suspender", path: "/polos/:id/suspender", color: "error", confirm: "Suspender este polo?", hidden: (r) => r.statusCredenciamento !== "CREDENCIADO" },
        ]} />
      <Box sx={{ height: 16 }} />
      <EduResourcePage title="Cursos ofertados por polo" base={BASE} resource="/polo-ofertas" dense searchable={false}
        columns={[
          { key: "poloId", label: "Polo", render: (r) => nameOf(polos, r.poloId) }, { key: "programId", label: "Curso", render: (r) => nameOf(cursos, r.programId) },
          { key: "vagas", label: "Vagas" }, { key: "ativo", label: "Ativo" },
        ]}
        fields={[
          { key: "poloId", label: "Polo", type: "select", options: polos, required: true, createOnly: true }, { key: "programId", label: "Curso", type: "select", options: cursos, required: true, createOnly: true },
          { key: "vagas", label: "Vagas", type: "number", required: true }, { key: "ativo", label: "Ativo", type: "bool" },
        ]} />
      {chk ? <Checklist poloId={chk.id} nome={chk.nome} onClose={() => { setChk(null); ind.reload(); }} /> : null}
    </Box>
  );
}

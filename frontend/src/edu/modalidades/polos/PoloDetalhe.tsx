import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, MenuItem, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import { Loadable, MiniTable, Section, StatusChip, fmtD, fmtDT, useAsync, usePolos, useTerms } from "../kit";
import { BASE, Card, Cards, get, money, pctTxt, post, rotuloNivel, corNivel, useAcao } from "./util";
import { eduApi } from "../../../services/EduApi";

const SUB = ["Resumo", "Alunos e cursos", "Cobrança", "Repasse", "Provas presenciais", "Estágios e matrículas", "Rematrícula", "ENADE", "Egressos"];

/** Painel de um polo: KPIs e as áreas separadas por polo (alunos, cobrança, repasse, provas, estágios, rematrícula, ENADE, egressos). */
export default function PoloDetalhe({ poloId, onTrocar }: { poloId: string; onTrocar: (id: string) => void }) {
  const polos = usePolos();
  const [sub, setSub] = useState(0);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label="Polo" value={poloId} onChange={(e) => onTrocar(e.target.value)} sx={{ minWidth: 280 }}>
          {polos.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </TextField>
      </Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {SUB.map((s) => <Tab key={s} label={s} />)}
      </Tabs>
      {sub === 0 && <Resumo poloId={poloId} />}
      {sub === 1 && <AlunosCursos poloId={poloId} />}
      {sub === 2 && <Cobranca poloId={poloId} />}
      {sub === 3 && <Repasse poloId={poloId} />}
      {sub === 4 && <Provas poloId={poloId} />}
      {sub === 5 && <EstagiosMatriculas poloId={poloId} />}
      {sub === 6 && <Rematricula poloId={poloId} />}
      {sub === 7 && <Enade poloId={poloId} />}
      {sub === 8 && <Egressos poloId={poloId} />}
    </Box>
  );
}

function Resumo({ poloId }: { poloId: string }) {
  const { data: k, loading, error } = useAsync(() => get(`/polo/${poloId}/painel`), [poloId]);
  return (
    <Loadable loading={loading} error={error}>
      {k ? (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{k.polo.nome}</Typography>
            <Chip label={rotuloNivel(k.nivel)} sx={{ bgcolor: corNivel(k.nivel), color: "#fff", fontWeight: 700 }} />
            <Typography color="text.secondary">{[k.polo.cidade, k.polo.uf].filter(Boolean).join("/")} · Coordenação: {k.polo.responsavelNome || "—"}</Typography>
          </Box>
          <Cards>
            <Card label="Alunos ativos" value={k.alunosAtivos} hint={`${k.alunosTotal} vinculados · ${k.trancados} trancado(s)`} color="#16a34a" />
            <Card label="Inadimplência" value={pctTxt(k.inadimplenciaPct)} hint={`${k.inadimplentes} aluno(s) · ${money(k.valorVencido)}`} color="#dc2626" />
            <Card label="Rematrícula" value={pctTxt(k.rematriculaPct)} hint={k.rematricula ? `${k.rematricula.confirmadas}/${k.rematricula.base} confirmadas` : "sem campanha"} color="#7c3aed" />
            <Card label="Evasão" value={pctTxt(k.evasaoPct)} hint={`${k.evadidos} desistente(s)/cancelado(s)`} color="#ca8a04" />
            <Card label="Provas próximas (30 dias)" value={k.provasProximas} hint={k.proximaProva ? `Próxima: ${fmtDT(k.proximaProva.dataHora)}` : undefined} color="#0891b2" />
            <Card label="ENADE" value={`${k.enade.participaram}/${k.enade.total}`} hint={`ano ${k.enade.ano}`} color="#0f766e" />
            <Card label="Egressos" value={k.egressos} color="#475569" />
            <Card label="Boletos emitidos" value={k.boletosEmitidos} color="#2563eb" />
          </Cards>
          <Section title="Funil de ofertas (2ª graduação / pós)">
            <Typography>{Object.entries(k.ofertas || {}).map(([s, n]) => `${s.toLowerCase()}: ${n}`).join(" · ") || "Nenhuma oferta gerada para este polo."}</Typography>
          </Section>
        </>
      ) : null}
    </Loadable>
  );
}

function AlunosCursos({ poloId }: { poloId: string }) {
  return (
    <>
      <Section title="Cursos ofertados neste polo" hint="Vagas e turnos por curso. Cadastro em “Cadastro e cursos”.">
        <MiniTable url={`${BASE}/polo/${poloId}/cursos`} columns={[
          { label: "Curso", render: (r) => r.curso || r.programId }, { label: "Modalidade", render: (r) => r.modalidade || "—" },
          { label: "Vagas", render: (r) => r.vagas, align: "right" }, { label: "Matriculados", render: (r) => r.matriculados, align: "right" }, { label: "Livres", render: (r) => r.vagasLivres, align: "right" },
          { label: "Turnos", render: (r) => (r.turnosLista || []).join(" / ") || "—" },
        ]} pick={(d) => d || []} />
      </Section>
      <Section title="Alunos do polo">
        <MiniTable url={`${BASE}/polo/${poloId}/alunos`} pick={(d) => d?.items || []} columns={[
          { label: "RA", render: (r) => r.ra }, { label: "Aluno", render: (r) => r.nome }, { label: "Curso", render: (r) => r.curso || "—" },
          { label: "Situação", render: (r) => <StatusChip v={r.status} /> },
          { label: "Em atraso", render: (r) => (r.inadimplente ? <Chip size="small" color="error" label={money(r.valorVencido)} /> : "—"), align: "right" },
        ]} />
      </Section>
    </>
  );
}

function Cobranca({ poloId }: { poloId: string }) {
  const [filtro, setFiltro] = useState("");
  const { data, loading, error, reload } = useAsync(() => get(`/polo/${poloId}/cobranca${filtro ? `?situacao=${filtro}` : ""}`), [poloId, filtro]);
  const { run, ocupado, aviso } = useAcao(reload);
  const r = data?.resumo;
  return (
    <Loadable loading={loading} error={error}>
      {aviso}
      {r ? (
        <>
          <Cards>
            <Card label="Recebido" value={money(r.recebido)} color="#16a34a" />
            <Card label="Vencido (inadimplência)" value={money(r.vencido)} hint={`${pctTxt(r.inadimplenciaValorPct)} do emitido · ${r.alunosInadimplentes} aluno(s)`} color="#dc2626" />
            <Card label="A vencer" value={money(r.aVencer)} color="#2563eb" />
            <Card label="Boletos emitidos" value={r.boletosEmitidos} hint={`${r.vencidasSemBoleto} vencida(s) sem boleto`} color="#7c3aed" />
          </Cards>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            <Button variant="contained" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/cobranca/boletos`, { apenasVencidas: true }), (x) => `${x.emitidos} boleto(s) emitido(s) em modo de demonstração.`)}>Emitir boletos das vencidas (simulado)</Button>
            <Button variant="outlined" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/cobranca/lembrar`), (x) => `${x.notificados} aluno(s) notificado(s).`)}>Lembrar inadimplentes</Button>
          </Box>
          <Section title="Inadimplentes do polo">
            <MiniTableLocal rows={data.inadimplentes} cols={[["Aluno", (x: any) => x.nome], ["Parcelas", (x: any) => x.parcelas], ["Valor", (x: any) => money(x.valor)], ["Dias de atraso", (x: any) => x.diasAtraso]]} vazio="Nenhum inadimplente neste polo." />
          </Section>
          <Section title="Mensalidades e boletos" actions={
            <TextField select size="small" label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">Todas</MenuItem><MenuItem value="VENCIDAS">Vencidas</MenuItem><MenuItem value="A_VENCER">A vencer</MenuItem><MenuItem value="PAGAS">Pagas</MenuItem>
            </TextField>}>
            <MiniTableLocal rows={data.parcelas} cols={[["Aluno", (x: any) => x.aluno], ["Descrição", (x: any) => x.descricao], ["Vencimento", (x: any) => fmtD(x.vencimento)], ["Valor", (x: any) => money(x.valor)], ["Situação", (x: any) => <StatusChip v={x.status === "VENCIDA" ? "ATRASADO" : x.status} />], ["Boleto", (x: any) => x.boleto || "—"]]} vazio="Sem parcelas." />
          </Section>
        </>
      ) : null}
    </Loadable>
  );
}

/** Tabela simples sobre linhas já carregadas. */
function MiniTableLocal({ rows, cols, vazio }: { rows: any[]; cols: Array<[string, (x: any) => any]>; vazio: string }) {
  if (!rows?.length) return <Typography color="text.secondary" sx={{ py: 1 }}>{vazio}</Typography>;
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 14, "& th": { textAlign: "left", p: 0.8, borderBottom: "2px solid #e2e8f0" }, "& td": { p: 0.8, borderBottom: "1px solid #eef2f7" } }}>
        <thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.id || i}>{cols.map(([h, f]) => <td key={h}>{f(r)}</td>)}</tr>)}</tbody>
      </Box>
    </Box>
  );
}

function Repasse({ poloId }: { poloId: string }) {
  const cfg = useAsync(() => get(`/polo/${poloId}/repasse-config`), [poloId]);
  const lista = useAsync(() => get(`/polo/${poloId}/repasses`), [poloId]);
  const { run, ocupado, aviso } = useAcao(() => { cfg.reload(); lista.reload(); });
  const [pc, setPc] = useState<string>("");
  const [fx, setFx] = useState<string>("");
  const hoje = new Date();
  const [comp, setComp] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  return (
    <Box>
      {aviso}
      <Section title="Regra de repasse do polo" hint="Repasse = percentual sobre o recebido no mês + valor fixo por aluno ativo.">
        <Loadable loading={cfg.loading} error={cfg.error}>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" type="number" label="% sobre o recebido" value={pc === "" ? cfg.data?.percentualRepasse ?? "" : pc} onChange={(e) => setPc(e.target.value)} sx={{ width: 180 }} />
            <TextField size="small" type="number" label="Valor fixo por aluno (R$)" value={fx === "" ? cfg.data?.valorFixoAluno ?? "" : fx} onChange={(e) => setFx(e.target.value)} sx={{ width: 200 }} />
            <Button variant="outlined" disabled={ocupado} onClick={() => run(() => eduApi.put(`${BASE}/polo/${poloId}/repasse-config`, { percentualRepasse: Number(pc === "" ? cfg.data?.percentualRepasse : pc), valorFixoAluno: Number(fx === "" ? cfg.data?.valorFixoAluno ?? 0 : fx) }), "Regra de repasse salva.")}>Salvar regra</Button>
          </Box>
        </Loadable>
      </Section>
      <Section title="Repasses mensais" actions={
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" type="month" label="Competência" value={comp} onChange={(e) => setComp(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Button variant="contained" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/repasses/apurar`, { competencia: comp }), "Repasse apurado.")}>Apurar</Button>
        </Box>}>
        <Loadable loading={lista.loading} error={lista.error}>
          <Cards>
            <Card label="Receita recebida (histórico)" value={money(lista.data?.totalReceita)} color="#16a34a" />
            <Card label="Total já repassado" value={money(lista.data?.totalRepassado)} color="#2563eb" />
          </Cards>
          <MiniTableLocal rows={lista.data?.items || []} vazio="Nenhum repasse apurado."
            cols={[["Competência", (x: any) => x.competencia], ["Alunos", (x: any) => x.alunosAtivos], ["Previsto", (x: any) => money(x.receitaPrevista)], ["Recebido", (x: any) => money(x.receitaRecebida)], ["Inadimplência", (x: any) => money(x.inadimplencia)],
              ["Repasse", (x: any) => <b>{money(x.valorRepasse)}</b>], ["Situação", (x: any) => <StatusChip v={x.status} />],
              ["", (x: any) => (x.status === "CALCULADO" ? <Button size="small" onClick={() => run(() => post(`/repasses/${x.id}/aprovar`), "Repasse aprovado.")}>Aprovar</Button> : x.status === "APROVADO" ? <Button size="small" color="success" onClick={() => run(() => post(`/repasses/${x.id}/pagar`), "Repasse marcado como pago.")}>Marcar pago</Button> : null)]]} />
        </Loadable>
      </Section>
    </Box>
  );
}

function Provas({ poloId }: { poloId: string }) {
  const { data, loading, error, reload } = useAsync(() => get(`/provas?poloId=${poloId}&pageSize=100`), [poloId]);
  const { run, ocupado, aviso } = useAcao(reload);
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ titulo: "", disciplina: "", dataHora: "", local: "" });
  const itens: any[] = data?.items || [];
  return (
    <Box>
      {aviso}
      <Alert severity="info" sx={{ mb: 2 }}>Os alunos do polo recebem aviso automático 7 dias e 1 dia antes de cada prova presencial (mensagem simulada no ambiente de demonstração).</Alert>
      <Section title="Provas presenciais do polo" actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova prova</Button>}>
        <Loadable loading={loading} error={error}>
          <MiniTableLocal rows={itens} vazio="Nenhuma prova agendada."
            cols={[["Prova", (x: any) => x.titulo], ["Data e hora", (x: any) => fmtDT(x.dataHora)], ["Local", (x: any) => x.local || "—"], ["Situação", (x: any) => <StatusChip v={x.status} />],
              ["", (x: any) => (x.status === "AGENDADA" ? (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  <Button size="small" disabled={ocupado} onClick={() => run(() => post(`/provas/${x.id}/avisos`), (r) => (r.marco ? `Aviso ${r.marco}: ${r.enviados} enviado(s), ${r.jaEnviados} já enviado(s).` : "Ainda fora da janela de aviso (mais de 7 dias)."))}>Avisar alunos</Button>
                  <Button size="small" disabled={ocupado} onClick={() => run(() => post(`/provas/${x.id}/realizar`), "Prova marcada como realizada.")}>Realizada</Button>
                  <Button size="small" color="error" disabled={ocupado} onClick={() => window.confirm("Cancelar a prova e avisar os alunos?") && run(() => post(`/provas/${x.id}/cancelar`), "Prova cancelada; alunos avisados.")}>Cancelar</Button>
                </Box>) : null)]]} />
        </Loadable>
      </Section>
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova prova presencial</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Título" required value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          <TextField label="Disciplina" value={f.disciplina} onChange={(e) => setF({ ...f, disciplina: e.target.value })} />
          <TextField label="Data e hora" type="datetime-local" required slotProps={{ inputLabel: { shrink: true } }} value={f.dataHora} onChange={(e) => setF({ ...f, dataHora: e.target.value })} />
          <TextField label="Local / sala" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNovo(false)}>Fechar</Button>
          <Button variant="contained" disabled={ocupado || !f.titulo || !f.dataHora} onClick={async () => {
            const r = await run(() => post("/provas", { poloId, titulo: f.titulo, disciplina: f.disciplina || undefined, dataHora: new Date(f.dataHora).toISOString(), local: f.local || undefined }), "Prova agendada.");
            if (r) { setNovo(false); setF({ titulo: "", disciplina: "", dataHora: "", local: "" }); }
          }}>Agendar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function EstagiosMatriculas({ poloId }: { poloId: string }) {
  const est = useAsync(() => get(`/polo/${poloId}/estagios`), [poloId]);
  const mat = useAsync(() => get(`/polo/${poloId}/matriculas`), [poloId]);
  return (
    <>
      <Section title="Estágios dos alunos do polo">
        <Loadable loading={est.loading} error={est.error}>
          <Cards>
            <Card label="Estágios" value={est.data?.resumo.total} color="#2563eb" /><Card label="Em andamento" value={est.data?.resumo.emAndamento} color="#16a34a" />
            <Card label="Horas cumpridas" value={`${est.data?.resumo.horasCumpridas}/${est.data?.resumo.horasExigidas}`} color="#7c3aed" />
          </Cards>
          <MiniTableLocal rows={est.data?.items || []} vazio="Sem estágios."
            cols={[["Aluno", (x: any) => x.aluno], ["Concedente", (x: any) => x.concedente], ["Início", (x: any) => fmtD(x.inicio)], ["Horas", (x: any) => `${x.horasCumpridas}/${x.horasExigidas} (${x.percentual}%)`], ["Situação", (x: any) => <StatusChip v={x.status} />]]} />
        </Loadable>
      </Section>
      <Section title="Matrículas do polo">
        <Loadable loading={mat.loading} error={mat.error}>
          <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mb: 1 }}>
            {Object.entries(mat.data?.resumo || {}).map(([c, v]: any) => <Chip key={c} size="small" label={`${c}: ${v.ATIVA} ativa(s), ${v.TRANCADA} trancada(s), ${v.CANCELADA} cancelada(s), ${v.CONCLUIDA} concluída(s)`} />)}
          </Box>
          <MiniTableLocal rows={mat.data?.items || []} vazio="Sem matrículas."
            cols={[["Aluno", (x: any) => x.aluno], ["Curso", (x: any) => x.curso], ["Período", (x: any) => x.periodo], ["Situação", (x: any) => <StatusChip v={x.status} />], ["Data", (x: any) => fmtD(x.dataMatricula)]]} />
        </Loadable>
      </Section>
    </>
  );
}

function Rematricula({ poloId }: { poloId: string }) {
  const { data, loading, error, reload } = useAsync(() => get(`/polo/${poloId}/rematricula`), [poloId]);
  const { run, ocupado, aviso } = useAcao(reload);
  const terms = useTerms();
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ nome: "", termDestinoId: "", janelaInicio: "", janelaFim: "", desc: "0" });
  return (
    <Box>
      {aviso}
      <Section title="Campanhas de rematrícula deste polo" hint="A rematrícula bloqueia inadimplentes e mostra as pendências de cada aluno." actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova campanha</Button>}>
        <Loadable loading={loading} error={error}>
          {(data || []).map((c: any) => (
            <Box key={c.campanha.id} sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{c.campanha.nome}</Typography><StatusChip v={c.campanha.status} />
                <Typography variant="caption">Janela: {fmtD(c.campanha.janelaInicio)} a {fmtD(c.campanha.janelaFim)}</Typography>
                <Button size="small" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/rematricula/campanhas/${c.campanha.id}/lembrar`), (r) => `${r.notificados} aluno(s) lembrado(s).`)}>Lembrar pendentes</Button>
              </Box>
              <Cards>
                <Card label="Base" value={c.retencao.base} color="#2563eb" /><Card label="Confirmadas" value={c.retencao.confirmadas} hint={pctTxt(c.retencao.taxaRetencao)} color="#16a34a" />
                <Card label="Pendentes" value={c.retencao.pendentes} color="#ca8a04" /><Card label="Não renovaram" value={c.retencao.naoRenovou} color="#dc2626" />
              </Cards>
              <MiniTableLocal rows={c.itens} vazio="Sem itens."
                cols={[["Aluno", (x: any) => x.aluno], ["Situação", (x: any) => <StatusChip v={x.status} />], ["Pendências", (x: any) => (Array.isArray(x.pendencias) && x.pendencias.length ? x.pendencias.join("; ") : "—")], ["Mensalidade", (x: any) => money(x.valorFinal)],
                  ["", (x: any) => (x.status === "CONFIRMADA" || x.status === "NAO_RENOVOU" ? null : (
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Button size="small" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/rematricula/itens/${x.id}/recalcular`), "Pendências recalculadas.")}>Recalcular</Button>
                      <Button size="small" color="success" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/rematricula/itens/${x.id}/confirmar`, { ignorarJanela: true }), "Rematrícula confirmada.")}>Confirmar</Button>
                      <Button size="small" color="error" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/rematricula/itens/${x.id}/nao-renovou`), "Marcado como não renovou.")}>Não renovou</Button>
                    </Box>))]]} />
            </Box>
          ))}
          {!(data || []).length ? <Typography color="text.secondary">Nenhuma campanha para este polo ainda.</Typography> : null}
        </Loadable>
      </Section>
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova campanha de rematrícula</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Nome" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <TextField select label="Período de destino" required value={f.termDestinoId} onChange={(e) => setF({ ...f, termDestinoId: e.target.value })}>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
          <TextField label="Início da janela" type="date" required slotProps={{ inputLabel: { shrink: true } }} value={f.janelaInicio} onChange={(e) => setF({ ...f, janelaInicio: e.target.value })} />
          <TextField label="Fim da janela" type="date" required slotProps={{ inputLabel: { shrink: true } }} value={f.janelaFim} onChange={(e) => setF({ ...f, janelaFim: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNovo(false)}>Fechar</Button>
          <Button variant="contained" disabled={ocupado || !f.nome || !f.termDestinoId || !f.janelaInicio || !f.janelaFim} onClick={async () => {
            const r = await run(() => post(`/polo/${poloId}/rematricula/campanhas`, { nome: f.nome, termDestinoId: f.termDestinoId, janelaInicio: new Date(f.janelaInicio).toISOString(), janelaFim: new Date(`${f.janelaFim}T23:59:00`).toISOString(), abrir: true, notificar: true }), (x) => `Campanha aberta: ${x.elegiveis} elegíveis, ${x.pendenciaFinanceira} com pendência financeira.`);
            if (r) setNovo(false);
          }}>Abrir campanha</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Enade({ poloId }: { poloId: string }) {
  const ano = new Date().getFullYear();
  const { data, loading, error, reload } = useAsync(() => get(`/polo/${poloId}/enade?ano=${ano}`), [poloId]);
  const { run, ocupado, aviso } = useAcao(reload);
  const i = data?.indicadores;
  return (
    <Box>
      {aviso}
      <Alert severity="info" sx={{ mb: 2 }}>
        {data?.links?.nota || "Questões e simulados do ENADE ficam no módulo de Exames."}{" "}
        <Link href={data?.links?.rotaTela || "/edu/exames"}>Abrir módulo de Exames</Link> · <Link href="/edu/desempenho">ENADE, OAB e desempenho</Link>
      </Alert>
      <Section title={`Preparatório e participação no ENADE ${ano}`} actions={<Button variant="outlined" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/enade/gerar`, { ano }), (r) => `${r.criados} aluno(s) incluído(s) na lista do ENADE.`)}>Gerar lista do polo</Button>}>
        <Loadable loading={loading} error={error}>
          {i ? (
            <Cards>
              <Card label="Alunos na lista" value={i.total} color="#2563eb" /><Card label="Participaram" value={i.participaram} hint={pctTxt(i.participacaoPct)} color="#16a34a" />
              <Card label="Inscritos" value={i.inscritos} color="#0891b2" /><Card label="Em preparatório" value={i.emPreparatorio} hint={pctTxt(i.preparatorioPct)} color="#7c3aed" />
              <Card label="Ausentes" value={i.ausentes} color="#dc2626" /><Card label="Média do simulado" value={data.mediaSimulado ?? "—"} color="#0f766e" />
            </Cards>
          ) : null}
          <MiniTableLocal rows={data?.items || []} vazio="Lista vazia. Use “Gerar lista do polo”."
            cols={[["Aluno", (x: any) => x.aluno],
              ["Situação", (x: any) => (
                <TextField select size="small" value={x.situacao} disabled={ocupado} onChange={(e) => run(() => eduApi.put(`${BASE}/polo/${poloId}/enade/${x.studentId}`, { ano, situacao: e.target.value }), "Situação atualizada.")} sx={{ minWidth: 150 }}>
                  {["PENDENTE", "INSCRITO", "PARTICIPOU", "AUSENTE", "DISPENSADO"].map((s) => <MenuItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</MenuItem>)}
                </TextField>)],
              ["Preparatório", (x: any) => <FormControlLabel label="" control={<Checkbox checked={x.preparatorio} disabled={ocupado} onChange={(e) => run(() => eduApi.put(`${BASE}/polo/${poloId}/enade/${x.studentId}`, { ano, preparatorio: e.target.checked }), "Preparatório atualizado.")} />} />],
              ["Simulado", (x: any) => x.simuladoNota ?? "—"]]} />
        </Loadable>
      </Section>
    </Box>
  );
}

function Egressos({ poloId }: { poloId: string }) {
  const { data, loading, error, reload } = useAsync(() => get(`/polo/${poloId}/egressos`), [poloId]);
  const { run, ocupado, aviso } = useAcao(reload);
  const i = data?.indicadores;
  return (
    <Box>
      {aviso}
      <Section title="Acompanhamento de egressos do polo" hint="Usa o cadastro de egressos do módulo de Apoio ao estudante; aqui só aparecem os formados deste polo."
        actions={<Button variant="outlined" disabled={ocupado} onClick={() => run(() => post(`/polo/${poloId}/egressos/sincronizar`), (r) => `${r.criados} novo(s) egresso(s) criado(s) a partir de concluintes.`)}>Sincronizar concluintes</Button>}>
        <Loadable loading={loading} error={error}>
          {i ? (
            <Cards>
              <Card label="Egressos" value={i.total} color="#2563eb" /><Card label="Empregabilidade" value={pctTxt(i.empregabilidadePct)} hint={`${i.empregados} trabalhando`} color="#16a34a" />
              <Card label="Atuam na área" value={pctTxt(i.atuamNaAreaPct)} color="#7c3aed" /><Card label="Cursando pós" value={i.cursandoPos} color="#0891b2" />
              <Card label="Aceitam contato" value={i.comConsentimentoContato} color="#0f766e" /><Card label="Dados desatualizados (>1 ano)" value={i.desatualizados} color="#ca8a04" />
            </Cards>
          ) : null}
          <MiniTableLocal rows={data?.items || []} vazio="Nenhum egresso vinculado a este polo."
            cols={[["Egresso", (x: any) => x.nome], ["Curso", (x: any) => x.programaNome || "—"], ["Conclusão", (x: any) => x.anoConclusao || "—"], ["Situação", (x: any) => <StatusChip v={x.situacaoProfissional} />], ["Empregador", (x: any) => x.empregadorAtual || "—"], ["Contato autorizado", (x: any) => (x.consenteContato ? "Sim" : "Não")]]} />
        </Loadable>
      </Section>
    </Box>
  );
}

import { Box, Typography } from "@mui/material";
import { Async, Bars, Panel, Stat, StatGrid, brl, fmtDate, label, num, pct, useApi } from "../infraestrutura/kit";

const COR_STATUS: Record<string, string> = { DISPONIVEL: "#2e7d32", EMPRESTADO: "#0288d1", RESERVADO: "#7b1fa2", EM_REPARO: "#ed6c02", EXTRAVIADO: "#d32f2f", BAIXADO: "#9e9e9e" };

export default function PainelBib() {
  const res = useApi<any>("/biblioteca/relatorios/resumo");
  const top = useApi<any>("/biblioteca/relatorios/mais-emprestados?limite=8");
  const atr = useApi<any>("/biblioteca/relatorios/atrasos");
  const area = useApi<any>("/biblioteca/relatorios/acervo-por-area");
  const giro = useApi<any>("/biblioteca/relatorios/giro");
  const usu = useApi<any>("/biblioteca/relatorios/usuarios-ativos?limite=5");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={res}>
        {(d) => (
          <>
            <StatGrid>
              <Stat label="Títulos" value={num(d.obras, 0)} /><Stat label="Exemplares" value={num(d.exemplaresTotal, 0)} />
              <Stat label="Empréstimos ativos" value={num(d.emprestimosAtivos, 0)} /><Stat label="Atrasados" value={num(d.emprestimosAtrasados, 0)} tone={d.emprestimosAtrasados ? "error" : "success"} />
              <Stat label="Multas em aberto" value={brl(d.multasEmAberto?.valor)} hint={`${d.multasEmAberto?.quantidade ?? 0} multa(s)`} tone={d.multasEmAberto?.valor ? "warning" : "success"} />
              <Stat label="Leitores ativos" value={num(d.leitoresAtivos, 0)} /><Stat label="Recursos virtuais" value={num(d.recursosVirtuaisAtivos, 0)} />
              <Stat label="Giro do acervo" value={giro.data?.giroGeral == null ? "—" : num(giro.data.giroGeral, 2)} hint="Empréstimos por exemplar" />
            </StatGrid>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Panel title="Situação dos exemplares"><Bars items={Object.entries(d.exemplaresPorStatus || {}).map(([k, v]) => ({ label: label(k), value: Number(v), color: COR_STATUS[k] }))} /></Panel>
              <Panel title="Reservas e repositório">
                <Bars items={[...Object.entries(d.reservasPorStatus || {}).map(([k, v]) => ({ label: `Reservas: ${label(k)}`, value: Number(v), color: "#7b1fa2" })), ...Object.entries(d.repositorioPorStatus || {}).map(([k, v]) => ({ label: `Repositório: ${label(k)}`, value: Number(v), color: "#0288d1" }))]} empty="Sem reservas ou itens no repositório." />
              </Panel>
            </Box>
          </>
        )}
      </Async>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Panel title="Obras mais emprestadas" subtitle="Últimos 12 meses">
          <Async state={top}>{(d) => <Bars items={(d.itens || []).map((o: any) => ({ label: o.titulo || o.obraId, value: o.emprestimos }))} />}</Async>
        </Panel>
        <Panel title="Acervo por área (CDD)" subtitle="Títulos por classe principal">
          <Async state={area}>{(d) => <Bars items={Object.entries(d || {}).map(([k, v]: any) => ({ label: `CDD ${k}`, value: v.titulos, hint: `${v.exemplares} exemplar(es)`, color: "#7b1fa2" }))} />}</Async>
        </Panel>
        <Panel title="Usuários mais ativos">
          <Async state={usu}>{(d) => (<><Typography variant="body2" sx={{ mb: 1 }}>{d.usuariosAtivos} de {d.leitoresCadastrados} leitores emprestaram ({pct(d.taxaUtilizacao)})</Typography><Bars items={(d.ranking || []).map((r: any) => ({ label: r.nome || r.leitorId, value: r.emprestimos, color: "#2e7d32" }))} /></>)}</Async>
        </Panel>
        <Panel title="Empréstimos em atraso" subtitle="Os mais antigos primeiro">
          <Async state={atr}>
            {(d) => (
              <Box sx={{ display: "grid", gap: 1 }}>
                <Typography variant="body2">{d.total} atrasado(s) · multa prevista total <b>{brl(d.multaPrevistaTotal)}</b></Typography>
                {(d.itens || []).slice(0, 6).map((e: any) => <Typography key={e.id} variant="body2">{e.leitor?.nome} — {e.exemplar?.obra?.titulo} · venceu em {fmtDate(e.dataPrevista)}</Typography>)}
                {!d.total && <Typography color="text.secondary" variant="body2">Nenhum atraso.</Typography>}
              </Box>
            )}
          </Async>
        </Panel>
      </Box>
    </Box>
  );
}

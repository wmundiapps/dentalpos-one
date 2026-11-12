import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../../services/EduApi";
import { Loadable, Section, StatusChip, fmtD, usePolos, useAsync } from "../kit";
import { BASE, Card, Cards, get, pctTxt, post, useAcao } from "./util";

const VAZIA = { nome: "", tipo: "SEGUNDA_GRADUACAO", gatilho: "EGRESSO", descontoPct: "20", prazoDias: "15", canal: "EMAIL", limiteContatos: "2", janelaInicio: "09:00", janelaFim: "20:00", poloId: "", afim: "" };

/** "Pedagogia: Psicopedagogia, Gestão Escolar" por linha -> objeto. */
const parseAfim = (t: string) => {
  const o: Record<string, string[]> = {};
  for (const l of t.split("\n")) { const [k, v] = l.split(":"); if (k?.trim() && v?.trim()) o[k.trim()] = v.split(",").map((x) => x.trim()).filter(Boolean); }
  return Object.keys(o).length ? o : undefined;
};

/** Ofertas automáticas de segunda graduação e pós-graduação: políticas configuráveis, funil e comunicação respeitando o consentimento de marketing (LGPD). */
export default function OfertasAuto() {
  const funil = useAsync(() => get("/ofertas-auto/funil"), []);
  const pols = useAsync(() => get("/ofertas-auto/politicas?pageSize=100"), []);
  const ofertas = useAsync(() => get("/ofertas-auto?pageSize=200"), []);
  const recarregar = () => { funil.reload(); pols.reload(); ofertas.reload(); };
  const { run, ocupado, aviso } = useAcao(recarregar);
  const polos = usePolos();
  const [dlg, setDlg] = useState(false);
  const [f, setF] = useState<any>(VAZIA);
  const [resultado, setResultado] = useState<any>(null);
  const fu = funil.data;

  async function salvar() {
    const body: any = {
      nome: f.nome, tipo: f.tipo, gatilho: f.gatilho, descontoPct: Number(f.descontoPct), prazoDias: Number(f.prazoDias), canal: f.canal, limiteContatos: Number(f.limiteContatos),
      janelaInicio: f.janelaInicio, janelaFim: f.janelaFim, poloId: f.poloId || null, areaAfim: parseAfim(f.afim),
    };
    const r = await run(() => post("/ofertas-auto/politicas", body), "Política criada.");
    if (r) { setDlg(false); setF(VAZIA); }
  }
  async function executar(p: any, dryRun: boolean) {
    const r = await run(() => post(`/ofertas-auto/politicas/${p.id}/executar`, { dryRun }), (x) => `${dryRun ? "Simulação" : "Execução"}: ${x.geradas} oferta(s) nova(s), ${x.reforcos} reforço(s).`);
    if (r) setResultado({ politica: p.nome, ...r });
  }

  return (
    <Box>
      {aviso}
      <Alert severity="info" sx={{ mb: 2 }}>
        Só recebem oferta egressos e concluintes com <b>consentimento de marketing ativo</b> (Central LGPD) e que não pediram para sair. Cada mensagem traz a forma de revogar. Os envios são simulados (notify) até haver provedores de e-mail/WhatsApp configurados.
      </Alert>
      <Loadable loading={funil.loading} error={funil.error}>
        {fu ? (
          <Cards>
            <Card label="Ofertadas" value={fu.ofertadas} color="#2563eb" />
            <Card label="Aceitas" value={fu.aceitas} hint={pctTxt(fu.taxaAceite)} color="#16a34a" />
            <Card label="Matriculadas" value={fu.matriculadas} hint={`${pctTxt(fu.taxaMatricula)} das ofertadas`} color="#7c3aed" />
            <Card label="Recusadas" value={fu.recusadas} color="#dc2626" />
            <Card label="Expiradas" value={fu.expiradas} color="#64748b" />
            <Card label="Em aberto" value={fu.emAberto} color="#ca8a04" />
          </Cards>
        ) : null}
      </Loadable>

      <Section title="Políticas de oferta" hint="Gatilho, desconto, prazo, canal, limite de contatos, janela de horário e curso-alvo por área afim." actions={<Button variant="contained" onClick={() => setDlg(true)}>Nova política</Button>}>
        <Loadable loading={pols.loading} error={pols.error}>
          {(pols.data?.items || []).map((p: any) => (
            <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", py: 1, borderBottom: "1px solid #eef2f7" }}>
              <Box sx={{ flex: 1, minWidth: 240 }}>
                <Typography sx={{ fontWeight: 800 }}>{p.nome} {!p.ativo ? <Chip size="small" label="inativa" /> : null}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {p.tipo === "POS_GRADUACAO" ? "Pós-graduação" : "Segunda graduação"} · gatilho: {p.gatilho.toLowerCase()} · {p.descontoPct}% de desconto · prazo {p.prazoDias} dias · {p.canal.toLowerCase()} · até {p.limiteContatos} contato(s) · {p.janelaInicio}–{p.janelaFim}{p.poloId ? ` · polo: ${polos.find((x) => x.value === p.poloId)?.label ?? ""}` : " · toda a rede"}
                </Typography>
              </Box>
              <Button size="small" disabled={ocupado || !p.ativo} onClick={() => executar(p, true)}>Simular</Button>
              <Button size="small" variant="contained" disabled={ocupado || !p.ativo} onClick={() => executar(p, false)}>Gerar ofertas</Button>
              <Button size="small" disabled={ocupado} onClick={() => run(() => eduApi.put(`${BASE}/ofertas-auto/politicas/${p.id}`, { ativo: !p.ativo }), p.ativo ? "Política desativada." : "Política ativada.")}>{p.ativo ? "Desativar" : "Ativar"}</Button>
            </Box>
          ))}
          {!(pols.data?.items || []).length ? <Typography color="text.secondary">Nenhuma política cadastrada.</Typography> : null}
        </Loadable>
        {resultado ? (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setResultado(null)}>
            <b>{resultado.politica}</b> ({resultado.dryRun ? "simulação — nada foi enviado" : "executada"}): {resultado.candidatos} candidato(s), {resultado.geradas} oferta(s) nova(s), {resultado.reforcos} reforço(s). Ignorados: {resultado.ignorados.semConsentimento} sem consentimento, {resultado.ignorados.semCursoAfim} sem curso afim, {resultado.ignorados.jaOfertada} já contatados recentemente, {resultado.ignorados.limiteContatos} no limite de contatos.
            {!resultado.janela.dentro ? ` Fora da janela de horário: envio agendado para ${new Date(resultado.janela.proximoEnvio).toLocaleString("pt-BR")}.` : ""}
          </Alert>
        ) : null}
      </Section>

      <Section title="Ofertas geradas" hint="Funil: ofertada → aceita → matriculada.">
        <Loadable loading={ofertas.loading} error={ofertas.error}>
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 14, "& th": { textAlign: "left", p: 0.8, borderBottom: "2px solid #e2e8f0" }, "& td": { p: 0.8, borderBottom: "1px solid #eef2f7" } }}>
              <thead><tr><th>Pessoa</th><th>Origem</th><th>Oferta</th><th>Desc.</th><th>Validade</th><th>Contatos</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {(ofertas.data?.items || []).map((o: any) => (
                  <tr key={o.id}>
                    <td>{o.nome}</td><td>{o.programaOrigem || "—"}</td><td>{o.alvoNome}<br /><Typography variant="caption" color="text.secondary">{o.politica?.nome}</Typography></td>
                    <td>{o.descontoPct}%</td><td>{fmtD(o.expiraEm)}</td><td>{o.contatos}</td><td><StatusChip v={o.status} /></td>
                    <td>
                      {o.status === "OFERTADA" ? <><Button size="small" disabled={ocupado} onClick={() => run(() => post(`/ofertas-auto/${o.id}/aceitar`), "Oferta aceita.")}>Aceitou</Button><Button size="small" color="error" disabled={ocupado} onClick={() => run(() => post(`/ofertas-auto/${o.id}/recusar`), "Oferta recusada.")}>Recusou</Button></> : null}
                      {o.status === "ACEITA" ? <Button size="small" color="success" disabled={ocupado} onClick={() => run(() => post(`/ofertas-auto/${o.id}/matricular`), (r) => (r.matriculaGerada ? "Matrícula gerada no período vigente." : "Marcada como matriculada."))}>Matricular</Button> : null}
                    </td>
                  </tr>
                ))}
                {!(ofertas.data?.items || []).length ? <tr><td colSpan={8}><Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>Nenhuma oferta gerada ainda.</Typography></td></tr> : null}
              </tbody>
            </Box>
          </Box>
        </Loadable>
      </Section>

      <Dialog open={dlg} onClose={() => setDlg(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova política de oferta automática</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Nome da política" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField select label="Tipo de oferta" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><MenuItem value="SEGUNDA_GRADUACAO">Segunda graduação</MenuItem><MenuItem value="POS_GRADUACAO">Pós-graduação</MenuItem></TextField>
            <TextField select label="Gatilho" value={f.gatilho} onChange={(e) => setF({ ...f, gatilho: e.target.value })}><MenuItem value="CONCLUINTE">Concluinte</MenuItem><MenuItem value="EGRESSO">Egresso</MenuItem><MenuItem value="AMBOS">Concluinte e egresso</MenuItem></TextField>
            <TextField label="Desconto (%)" type="number" value={f.descontoPct} onChange={(e) => setF({ ...f, descontoPct: e.target.value })} />
            <TextField label="Prazo da oferta (dias)" type="number" value={f.prazoDias} onChange={(e) => setF({ ...f, prazoDias: e.target.value })} />
            <TextField select label="Canal" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}><MenuItem value="EMAIL">E-mail</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem><MenuItem value="SMS">SMS</MenuItem><MenuItem value="IN_APP">Portal do aluno</MenuItem></TextField>
            <TextField label="Limite de contatos por pessoa" type="number" value={f.limiteContatos} onChange={(e) => setF({ ...f, limiteContatos: e.target.value })} />
            <TextField label="Janela: início" value={f.janelaInicio} onChange={(e) => setF({ ...f, janelaInicio: e.target.value })} helperText="HH:MM (horário de Brasília)" />
            <TextField label="Janela: fim" value={f.janelaFim} onChange={(e) => setF({ ...f, janelaFim: e.target.value })} />
          </Box>
          <TextField select label="Polo" value={f.poloId} onChange={(e) => setF({ ...f, poloId: e.target.value })} helperText="Em branco = toda a rede"><MenuItem value="">Toda a rede</MenuItem>{polos.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField>
          <TextField multiline minRows={3} label="Cursos afins (opcional)" value={f.afim} onChange={(e) => setF({ ...f, afim: e.target.value })} placeholder={"Pedagogia: Psicopedagogia, Gestão Escolar\nAdministração: Gestão Empresarial"} helperText="Uma linha por curso de origem: palavras do curso-alvo. Em branco usa a tabela padrão de áreas afins." />
        </DialogContent>
        <DialogActions><Button onClick={() => setDlg(false)}>Fechar</Button><Button variant="contained" disabled={ocupado || f.nome.length < 3} onClick={salvar}>Salvar política</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

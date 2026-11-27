import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, ActionsMenu, Aviso, Btn, DataList, Etiqueta, FormDialog, LoadBox, Pick, Section, cp, fmtDateTime, itemsOf, perfil, useCp, useDebounced, useRunner, useToast } from "./kit";

export default function PacientesTab() {
  const pf = perfil();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [tipo, setTipo] = useState("");
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [acessos, setAcessos] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useCp<any>(`/clinicas/pacientes?pageSize=100${dq ? `&q=${encodeURIComponent(dq)}` : ""}${tipo ? `&tipo=${tipo}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Pacientes, tutores e consentimento (LGPD)" actions={<><Button size="small" variant="contained" onClick={() => setNovo(true)} disabled={!pf.recepcao}>Novo cadastro</Button>{pf.gestor && <Button size="small" onClick={() => setAcessos(true)}>Log de acessos</Button>}</>}>
      {node}
      <Aviso>Dados de saúde são sensíveis (LGPD, art. 11): CPF, telefone e resumo de saúde ficam cifrados; cada perfil vê apenas o mínimo necessário e todo acesso é registrado.</Aviso>
      <Acoes>
        <TextField size="small" label="Buscar por nome" value={q} onChange={(e) => setQ(e.target.value)} />
        <Pick label="Tipo" value={tipo} onChange={setTipo} all="Todos" minWidth={150} options={[{ value: "PACIENTE", label: "Pacientes" }, { value: "TUTOR", label: "Tutores (animais)" }]} />
      </Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum cadastro encontrado.">
        <DataList rows={rows} columns={[
          { label: "Nome", primary: true, render: (p) => p.nome }, { label: "Tipo", render: (p) => (p.tipo === "TUTOR" ? "Tutor" : "Paciente") }, { label: "Idade", render: (p) => (p.idade ?? "—") },
          { label: "CPF", render: (p) => p.cpf ?? "—", hideOnMobile: true },
          { label: "Consentimento", render: (p) => <Etiqueta t={p.consentimentoStatus === "ATIVO" ? "Ativo" : p.consentimentoStatus === "REVOGADO" ? "Revogado" : "Pendente"} color={p.consentimentoStatus === "ATIVO" ? "success" : "error"} /> },
          { label: "Faltas seguidas", render: (p) => <Etiqueta t={p.faltasConsecutivas} color={p.faltasConsecutivas >= 3 ? "error" : p.faltasConsecutivas ? "warning" : "default"} /> },
        ]} onRowClick={(p) => setSel(p.id)} actions={(p) => (
          <ActionsMenu items={[{ label: "Abrir ficha", onClick: () => setSel(p.id) }, { label: "Revogar consentimento", color: "error", show: pf.recepcao && p.consentimentoStatus === "ATIVO", onClick: () => run(() => cp("POST", `/clinicas/pacientes/${p.id}/consentimento/revogar`, {}), "Consentimento revogado; atendimentos futuros cancelados.", "Revogar o consentimento cancela os atendimentos futuros e a fila. Confirmar?") }]} />
        )} />
      </LoadBox>
      {novo && <Novo onClose={() => setNovo(false)} onDone={() => setRev((x) => x + 1)} clinico={pf.gestor} />}
      {sel && <Ficha id={sel} onClose={() => { setSel(null); setRev((x) => x + 1); }} />}
      {acessos && <Acessos onClose={() => setAcessos(false)} />}
    </Section>
  );
}

function Novo({ onClose, onDone, clinico }: { onClose: () => void; onDone: () => void; clinico: boolean }) {
  return (
    <FormDialog open title="Novo cadastro" maxWidth="md" submitLabel="Cadastrar" onClose={onClose}
      intro={<Aviso severity="warning">Informe somente os dados necessários. O consentimento do titular (ou do responsável, para menores) é obrigatório para atender.</Aviso>}
      fields={[
        { key: "tipo", label: "Tipo", type: "select", required: true, options: [{ value: "PACIENTE", label: "Paciente (atendimento humano)" }, { value: "TUTOR", label: "Tutor de animal" }] },
        { key: "nome", label: "Nome completo", required: true }, { key: "cpf", label: "CPF" }, { key: "dataNascimento", label: "Data de nascimento", type: "date" },
        { key: "telefone", label: "Telefone (WhatsApp)" }, { key: "email", label: "E-mail" },
        { key: "responsavelNome", label: "Responsável legal (menores)" }, { key: "responsavelCpf", label: "CPF do responsável" },
        ...(clinico ? [{ key: "saude", label: "Resumo de saúde (opcional, cifrado)", type: "textarea" as const }] : []),
        { key: "finalidade", label: "Finalidade do tratamento de dados", required: true, full: true, helper: "Ex.: Atendimento psicológico supervisionado na clínica-escola, com fins assistenciais e de ensino." },
        { key: "aceito", label: "O titular/responsável leu e consente com o tratamento de seus dados para essa finalidade", type: "bool" },
      ]}
      initial={{ tipo: "PACIENTE", finalidade: "Atendimento supervisionado na clínica-escola, com fins assistenciais e de ensino" }}
      onSubmit={async (b) => { const { finalidade, aceito, ...resto } = b; await cp("POST", "/clinicas/pacientes", { ...resto, consentimento: { aceito: Boolean(aceito), finalidade } }); onDone(); }} />
  );
}

function Ficha({ id, onClose }: { id: string; onClose: () => void }) {
  const pf = perfil();
  const [rev, setRev] = useState(0);
  const d = useCp<any>(`/clinicas/pacientes/${id}`, [rev]);
  const ag = useCp<any>(`/clinicas/agenda?pacienteId=${id}&pageSize=20&ordem=desc`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const p = d.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{p ? p.nome : "Ficha"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {p && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                <Etiqueta t={p.tipo === "TUTOR" ? "Tutor" : "Paciente"} />
                <Etiqueta t={`Consentimento ${p.consentimentoStatus === "ATIVO" ? "ativo" : "revogado/pendente"}`} color={p.consentimentoStatus === "ATIVO" ? "success" : "error"} />
                {p.menor && <Etiqueta t="Menor de idade" color="warning" />}
                {p.anonimizado && <Etiqueta t="Anonimizado" color="error" />}
              </Box>
              <Typography variant="body2">CPF: {p.cpf ?? "—"} · Idade: {p.idade ?? "—"} · Telefone: {p.telefone ?? "—"} · E-mail: {p.email ?? "—"}</Typography>
              {p.responsavelNome && <Typography variant="body2">Responsável: {p.responsavelNome}</Typography>}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Base legal: {p.baseLegal ?? "—"} · Versão do termo: {p.consentimentoVersao ?? "—"} · Finalidade: {p.consentimentoFinalidade ?? "—"}</Typography>
              {p.saude !== undefined && p.saude !== null && <Alert severity="warning" sx={{ mt: 2 }}><b>Resumo de saúde (dado sensível):</b> {p.saude}</Alert>}
              <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>Últimos atendimentos</Typography>
              <LoadBox loading={ag.loading} error={ag.error} empty={!itemsOf(ag.data).length} emptyText="Sem atendimentos.">
                <DataList rows={itemsOf(ag.data)} columns={[{ label: "Data", primary: true, render: (c: any) => fmtDateTime(c.inicio) }, { label: "Unidade", render: (c: any) => c.unidade }, { label: "Situação", render: (c: any) => c.status.replace(/_/g, " ").toLowerCase() }]} />
              </LoadBox>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions>
        {pf.recepcao && p && p.consentimentoStatus !== "ATIVO" && !p.anonimizado && <Btn onClick={() => run(() => cp("POST", `/clinicas/pacientes/${id}/consentimento`, { aceito: true, finalidade: p.consentimentoFinalidade ?? "Retomada do atendimento com novo consentimento" }), "Consentimento registrado.")}>Registrar novo consentimento</Btn>}
        {pf.gestor && p && !p.anonimizado && <Btn color="error" onClick={() => run(() => cp("POST", `/clinicas/pacientes/${id}/anonimizar`), "Cadastro anonimizado.", "Anonimizar remove nome, CPF, contatos e dados de saúde de forma irreversível. Confirmar?")}>Anonimizar (art. 18)</Btn>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

function Acessos({ onClose }: { onClose: () => void }) {
  const [acao, setAcao] = useState("");
  const l = useCp<any>(`/clinicas/acessos?pageSize=100${acao ? `&acao=${acao}` : ""}`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Log de acesso a dados sensíveis</DialogTitle>
      <DialogContent dividers>
        <Acoes><Pick label="Tipo de acesso" value={acao} onChange={setAcao} all="Todos" options={["LEITURA", "ESCRITA", "NEGADO", "QUEBRA_SIGILO"].map((x) => ({ value: x, label: x.replace(/_/g, " ").toLowerCase() }))} /></Acoes>
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!itemsOf(l.data).length} emptyText="Nenhum acesso registrado.">
          <DataList rows={itemsOf(l.data)} columns={[
            { label: "Quando", primary: true, render: (a: any) => fmtDateTime(a.createdAt) }, { label: "Quem", render: (a: any) => `${a.usuario ?? a.userId} (${a.papel})` },
            { label: "Acesso", render: (a: any) => <Etiqueta t={a.acao.replace(/_/g, " ").toLowerCase()} color={a.acao === "NEGADO" || a.acao === "QUEBRA_SIGILO" ? "error" : "default"} /> }, { label: "Recurso", render: (a: any) => a.recurso }, { label: "Justificativa", render: (a: any) => a.motivo ?? "—", hideOnMobile: true },
          ]} />
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

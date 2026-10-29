import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, LoadBox, Pick, Section, Status, Tabela, dataIso, fmtDate, fmtMoney, itemsOf, rh, useRh, useRunner, useToast, type FormField } from "./kit";

const VINCULOS = ["CLT", "PJ", "ESTAGIARIO", "PROFESSOR_HORISTA"];

export default function ColaboradoresTab() {
  const [rev, setRev] = useState(0);
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [vinc, setVinc] = useState("");
  const [novo, setNovo] = useState(false); const [sel, setSel] = useState<any | null>(null); const [edit, setEdit] = useState<any | null>(null);
  const [cpf, setCpf] = useState<string | null>(null); const [motivo, setMotivo] = useState("");
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>(`/colaboradores?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}${vinc ? `&vinculo=${vinc}` : ""}`, [rev]);
  const cargos = itemsOf(useRh<any>("/cargos?pageSize=100").data).map((c: any) => ({ value: c.id, label: c.nome }));
  const deps = itemsOf(useRh<any>("/departamentos?pageSize=100").data).map((c: any) => ({ value: c.id, label: c.nome }));
  const jors = itemsOf(useRh<any>("/jornadas?pageSize=100").data).map((c: any) => ({ value: c.id, label: c.nome }));
  const gest = itemsOf(l.data).map((c: any) => ({ value: c.id, label: c.nome }));
  const fields: FormField[] = [
    { key: "nome", label: "Nome completo", required: true }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "cpf", label: "CPF", helper: "Guardado cifrado; só os 2 últimos dígitos aparecem em listas." },
    { key: "tipo", label: "Tipo", type: "select", required: true, options: ["DOCENTE", "TECNICO_ADMINISTRATIVO"] }, { key: "vinculo", label: "Vínculo", type: "select", required: true, options: VINCULOS },
    { key: "cargoId", label: "Cargo", type: "select", options: cargos }, { key: "departamentoId", label: "Departamento", type: "select", options: deps }, { key: "gestorId", label: "Gestor", type: "select", options: gest }, { key: "jornadaId", label: "Jornada / escala", type: "select", options: jors },
    { key: "centroCusto", label: "Centro de custo" }, { key: "salarioBase", label: "Salário / bolsa / valor do contrato (R$)", type: "number" },
    { key: "valorHora", label: "Valor-hora (horista)", type: "number", hidden: (v) => v.vinculo !== "PROFESSOR_HORISTA" }, { key: "cargaMensalHoras", label: "Horas/mês (horista)", type: "number", hidden: (v) => v.vinculo !== "PROFESSOR_HORISTA" },
    { key: "dependentesIrrf", label: "Dependentes (IRRF)", type: "number" }, { key: "dataAdmissao", label: "Data de admissão", type: "date" }, { key: "dataNascimento", label: "Data de nascimento", type: "date" },
    { key: "banco", label: "Banco" }, { key: "agencia", label: "Agência" }, { key: "conta", label: "Conta (cifrada)" }, { key: "pix", label: "Chave PIX (cifrada)" }, { key: "userId", label: "ID do usuário de login (opcional)", helper: "Vincula o colaborador ao login para ponto e autoatendimento." },
  ];
  async function abrir(c: any) { try { setSel(await rh("GET", `/colaboradores/${c.id}`)); setCpf(null); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <Section title="Colaboradores" actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo colaborador</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>CPF, conta e PIX ficam cifrados. Salário e dados pessoais só aparecem para o RH; o gestor vê apenas a equipe.</Alert>
      <Acoes>
        <TextField size="small" label="Buscar (nome, matrícula, e-mail)" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 240 }} />
        <Pick label="Status" value={status} onChange={setStatus} all="Todos" options={["EM_ADMISSAO", "ATIVO", "AFASTADO", "FERIAS", "DESLIGADO"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} minWidth={150} />
        <Pick label="Vínculo" value={vinc} onChange={setVinc} all="Todos" options={VINCULOS.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} minWidth={150} />
      </Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} onRow={abrir} cols={[
          { h: "Matrícula", r: (c: any) => c.matricula }, { h: "Nome", r: (c: any) => c.nome }, { h: "Tipo", r: (c: any) => String(c.tipo).replace(/_/g, " ").toLowerCase(), hideMobile: true },
          { h: "Vínculo", r: (c: any) => String(c.vinculo).replace(/_/g, " ") }, { h: "Departamento", r: (c: any) => c.departamentoNome ?? "—" }, { h: "Cargo", r: (c: any) => c.cargoNome ?? "—", hideMobile: true },
          { h: "Status", r: (c: any) => <Status value={c.status} /> },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Novo colaborador" fields={fields} initial={{ tipo: "TECNICO_ADMINISTRATIVO", vinculo: "CLT", dependentesIrrf: 0 }} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/colaboradores", b), "Colaborador cadastrado.")} />
      <FormDialog open={!!edit} title={`Editar ${edit?.nome ?? ""}`} fields={fields.filter((f) => !["cpf", "conta", "pix"].includes(f.key))} initial={edit ? { ...edit, dataAdmissao: edit.dataAdmissao?.slice(0, 10), dataNascimento: edit.dataNascimento?.slice(0, 10) } : {}} onClose={() => setEdit(null)} onSubmit={(b) => run(() => rh("PUT", `/colaboradores/${edit.id}`, b), "Colaborador atualizado.")} />
      <Dialog open={!!sel} onClose={() => setSel(null)} fullWidth maxWidth="sm">
        <DialogTitle>{sel?.nome}</DialogTitle>
        <DialogContent dividers>
          {sel && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
              {([["Matrícula", sel.matricula], ["Status", sel.status], ["Vínculo", sel.vinculo], ["Tipo", sel.tipo], ["Cargo", sel.cargo?.nome], ["Departamento", sel.departamento?.nome], ["Gestor", sel.gestor?.nome], ["Jornada", sel.jornada?.nome], ["Admissão", fmtDate(sel.dataAdmissao)], ["CPF", sel.cpfMascarado], ["Salário", sel.salarioBase !== undefined ? fmtMoney(sel.salarioBase) : "restrito ao RH"], ["Centro de custo", sel.centroCusto]] as Array<[string, any]>).map(([k, v]) => <Typography key={k} variant="body2"><b>{k}:</b> {v ?? "—"}</Typography>)}
            </Box>
          )}
          {sel?.salarioBase !== undefined && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Consultar CPF completo (gera log de acesso)</Typography>
              <Acoes><TextField size="small" label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} /><Btn onClick={async () => { try { setCpf((await rh("GET", `/colaboradores/${sel.id}/cpf?motivo=${encodeURIComponent(motivo)}`)).cpf); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Revelar</Btn>{cpf && <b>{cpf}</b>}</Acoes>
            </Box>
          )}
        </DialogContent>
        <DialogActions>{sel?.salarioBase !== undefined && <Button onClick={() => { setEdit(sel); setSel(null); }}>Editar</Button>}<Button onClick={() => setSel(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}
void dataIso;

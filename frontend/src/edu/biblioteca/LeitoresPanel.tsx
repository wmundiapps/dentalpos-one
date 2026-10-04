import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, Light, Tag, fmtDate, label, useApi, useToast, type Field } from "../infraestrutura/kit";
import { SituacaoLeitor } from "./BalcaoPanel";

const PERFIS = ["ALUNO", "PROFESSOR", "FUNCIONARIO", "EXTERNO"];

function Situacao({ leitor, onClose }: { leitor: any; onClose: () => void }) {
  const st = useApi<any>(`/biblioteca/leitores/${leitor.id}/situacao`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>{leitor.nome}</DialogTitle>
      <DialogContent dividers><Async state={st}>{(s) => <SituacaoLeitor s={s} />}</Async></DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function LeitoresPanel() {
  const [key, setKey] = useState(0);
  const [dlg, setDlg] = useState<{ kind: "novo" | "editar" | "bloquear" | "aluno"; row?: any } | null>(null);
  const [sit, setSit] = useState<any | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const dados = (novo: boolean): Field[] => [
    ...(novo ? [{ key: "perfil", label: "Perfil", type: "select", options: PERFIS, required: true } as Field] : []),
    { key: "nome", label: "Nome", required: true }, { key: "documento", label: "Documento (CPF/RA)" }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "validadeAte", label: "Cadastro válido até", type: "date" },
    ...(novo ? [{ key: "studentId", label: "ID do aluno (perfil Aluno)" } as Field, { key: "userId", label: "ID do usuário (professor/funcionário)" } as Field] : []), { key: "ativo", label: "Ativo", type: "bool", def: true },
  ];
  return (
    <Box>
      <ListTable path="/biblioteca/leitores" refreshKey={key} filters={[{ key: "perfil", label: "Perfil", options: PERFIS }, { key: "ativo", label: "Ativo", options: ["true", "false"] }]}
        toolbar={<><Button onClick={() => setDlg({ kind: "aluno" })}>Criar a partir de aluno</Button><Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ kind: "novo" })}>Novo leitor</Button></>}
        columns={[
          { key: "nome", label: "Nome" }, { key: "perfil", label: "Perfil", render: (r) => <Tag text={label(r.perfil)} /> }, { key: "documento", label: "Documento" }, { key: "email", label: "E-mail" },
          { key: "bloqueadoAte", label: "Situação", render: (r) => (r.bloqueadoAte && new Date(r.bloqueadoAte) > new Date() ? <Light tone="error" text={`Bloqueado até ${fmtDate(r.bloqueadoAte)}`} /> : <Light tone={r.ativo ? "success" : "default"} text={r.ativo ? "Regular" : "Inativo"} />) },
        ]}
        actions={(r, rl) => (
          <>
            <Button size="small" onClick={() => setSit(r)}>Situação</Button>
            <Button size="small" onClick={() => setDlg({ kind: "editar", row: r })}>Editar</Button>
            {r.bloqueadoAte && new Date(r.bloqueadoAte) > new Date()
              ? <Button size="small" color="success" onClick={() => toast.run(() => eduApi.post(`/biblioteca/leitores/${r.id}/desbloquear`, {}), "Leitor desbloqueado.", rl, "Desbloquear este leitor?")}>Desbloquear</Button>
              : <Button size="small" color="error" onClick={() => setDlg({ kind: "bloquear", row: r })}>Bloquear</Button>}
          </>
        )} />
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} initial={dlg?.kind === "editar" ? dlg.row : null}
        title={dlg ? { novo: "Novo leitor", editar: "Editar leitor", bloquear: `Bloquear ${dlg.row?.nome || ""}`, aluno: "Criar leitor a partir de aluno" }[dlg.kind] : ""}
        intro={dlg?.kind === "aluno" ? <Alert severity="info" sx={{ mb: 2 }}>O leitor é criado (ou localizado) com os dados do cadastro acadêmico do aluno.</Alert> : undefined}
        fields={dlg?.kind === "bloquear" ? [{ key: "motivo", label: "Motivo", required: true, full: true }, { key: "ate", label: "Bloqueado até (padrão: 30 dias)", type: "date" }] : dlg?.kind === "aluno" ? [{ key: "studentId", label: "ID do aluno", required: true }] : dados(dlg?.kind === "novo")}
        onSubmit={async (b) => {
          if (dlg!.kind === "novo") await eduApi.post("/biblioteca/leitores", b);
          else if (dlg!.kind === "editar") await eduApi.put(`/biblioteca/leitores/${dlg!.row.id}`, b);
          else if (dlg!.kind === "bloquear") await eduApi.post(`/biblioteca/leitores/${dlg!.row.id}/bloquear`, b);
          else await eduApi.post(`/biblioteca/leitores/de-aluno/${b.studentId}`, {});
          toast.ok("Operação concluída."); reload();
        }} />
      {sit && <Situacao leitor={sit} onClose={() => setSit(null)} />}
      {toast.node}
    </Box>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import BadgeIcon from "@mui/icons-material/Badge";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import PageHeader from "../components/PageHeader";
import { addDoctorDocument, createDoctor, loadClinicUsers, loadDoctorDocuments, loadDoctors, removeDoctorDocument, updateDoctor, type Doctor, type DoctorDocument, type DoctorUser } from "../services/DoctorApi";

const VINCULOS: Array<[string, string]> = [["CLINICA","Sócio / da clínica"],["CLT","CLT"],["PJ","PJ contratado"],["AUTONOMO","Autônomo"],["LOCACAO","Locação de espaço"]];
const MODELOS: Array<[string, string]> = [["HONORARIO","Honorário (a clínica cobra o paciente e paga o profissional)"],["PARTICIPACAO","Participação na receita (cobrança dividida entre as partes)"],["LOCACAO","Locação de espaço (o profissional cobra o paciente e paga a clínica)"]];
const BASES: Array<[string, string]> = [["BRUTO","Sobre o valor bruto do procedimento"],["LIQUIDO","Sobre o líquido (após material, laboratório e taxas)"]];
const RATEIOS: Array<[string, string]> = [["RATEADO","Rateado no mesmo percentual"],["PROFISSIONAL","Por conta do profissional"],["CLINICA","Por conta da clínica"]];
const ESPECIALIDADES = ["Clínica geral","Implantodontia","Prótese","Ortodontia","Endodontia","Periodontia","Odontopediatria","Cirurgia","Dentística","Estética","Harmonização orofacial","DTM e dor orofacial","Radiologia","Odontogeriatria"];
const TIPOS_DOC: Array<[string, string]> = [["RG_CPF","RG / CPF"],["ENDERECO","Comprovante de endereço"],["DIPLOMA","Diploma"],["CRO","Carteira do CRO"],["CRO_REGULARIDADE","Certidão de regularidade do CRO"],["ESPECIALIZACAO","Título de especialista"],["CNPJ","Cartão CNPJ"],["CONTRATO_SOCIAL","Contrato social"],["ALVARA","Alvará de funcionamento"],["ALVARA_SANITARIO","Alvará sanitário"],["RESP_TECNICA","Responsabilidade técnica"],["CONTRATO_PRESTACAO","Contrato de prestação de serviço"],["SEGURO","Seguro de responsabilidade civil"],["OUTRO","Outro"]];

const VAZIO = {
  userId:"", cro:"", croState:"", rqe:"", specialty:"", specialties:[] as string[], contractType:"CLINICA", documentIssuer:"CLINICA",
  revenueModel:"HONORARIO", revenuePercent:"", revenueBase:"BRUTO", materialSplit:"RATEADO", labSplit:"RATEADO", cardFeeSplit:"RATEADO",
  cpf:"", rg:"", birthDate:"", personalAddress:"", personalCity:"", personalState:"", personalZipCode:"",
  companyName:"", tradeName:"", cnpj:"", companyCro:"", technicalManager:"", companyAddress:"", companyCity:"", companyState:"", companyZipCode:"", municipalRegistration:"",
  commissionPercent:"", payoutDay:"", bankName:"", bankAgency:"", bankAccount:"", pixKey:"", contractStartDate:"", contractEndDate:"", notes:"", consultationValue:"",
};
const nomeDe = (d: Doctor) => `${d.user?.firstName || ""} ${d.user?.lastName || ""}`.trim() || d.cro;
const dataBR = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "");
const soData = (v?: string | null) => (v ? String(v).slice(0, 10) : "");
const rotulo = (lista: Array<[string, string]>, v?: string | null) => (lista.find(([k]) => k === (v || ""))?.[1] || "");

export default function ClinicalTeam() {
  const [rows, setRows] = useState<Doctor[]>([]);
  const [users, setUsers] = useState<DoctorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [aba, setAba] = useState(0);
  const [docsDe, setDocsDe] = useState<Doctor | null>(null);
  const [docs, setDocs] = useState<DoctorDocument[]>([]);
  const DOC_VAZIO = { documentType:"RG_CPF", title:"", fileName:"", issueDate:"", expiresAt:"", notes:"" };
  const [docForm, setDocForm] = useState(DOC_VAZIO);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { const [d, u] = await Promise.all([loadDoctors(), loadClinicUsers().catch(() => [] as DoctorUser[])]); setRows(d); setUsers(u); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o corpo clínico."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const abrirNovo = () => { setEditId(null); setForm(VAZIO); setAba(0); setError(""); setOpen(true); };
  const abrirEdicao = (d: Doctor) => {
    setEditId(d.id);
    setForm({ ...VAZIO, userId:d.userId, cro:d.cro||"", croState:d.croState||"", rqe:d.rqe||"", specialty:d.specialty||"", specialties:d.specialties||[],
      contractType:d.contractType||"CLINICA", documentIssuer:d.documentIssuer||"CLINICA",
      revenueModel:d.revenueModel||"HONORARIO", revenuePercent:d.revenuePercent!=null?String(d.revenuePercent):"", revenueBase:d.revenueBase||"BRUTO",
      materialSplit:d.materialSplit||"RATEADO", labSplit:d.labSplit||"RATEADO", cardFeeSplit:d.cardFeeSplit||"RATEADO",
      cpf:d.cpf||"", rg:d.rg||"", birthDate:soData(d.birthDate), personalAddress:d.personalAddress||"", personalCity:d.personalCity||"", personalState:d.personalState||"", personalZipCode:d.personalZipCode||"",
      companyName:d.companyName||"", tradeName:d.tradeName||"", cnpj:d.cnpj||"", companyCro:d.companyCro||"", technicalManager:d.technicalManager||"",
      companyAddress:d.companyAddress||"", companyCity:d.companyCity||"", companyState:d.companyState||"", companyZipCode:d.companyZipCode||"", municipalRegistration:d.municipalRegistration||"",
      commissionPercent:d.commissionPercent!=null?String(d.commissionPercent):"", payoutDay:d.payoutDay!=null?String(d.payoutDay):"",
      bankName:d.bankName||"", bankAgency:d.bankAgency||"", bankAccount:d.bankAccount||"", pixKey:d.pixKey||"",
      contractStartDate:soData(d.contractStartDate), contractEndDate:soData(d.contractEndDate), notes:d.notes||"",
      consultationValue:d.consultationValue!=null?String(d.consultationValue):"" });
    setAba(0); setError(""); setOpen(true);
  };

  const salvar = async () => {
    setBusy(true); setError("");
    try {
      const payload: Record<string, unknown> = { ...form, specialty: form.specialty || form.specialties[0] || "Clínica geral" };
      if (editId) { delete payload.userId; await updateDoctor(editId, payload); }
      else {
        if (!form.userId) { setError("Escolha o usuário do sistema ligado a este profissional."); setBusy(false); return; }
        if (!form.cro.trim()) { setError("Informe o CRO."); setBusy(false); return; }
        await createDoctor(payload);
      }
      setOpen(false); setNotice("Profissional salvo."); await carregar();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setBusy(false); }
  };

  const abrirDocs = async (d: Doctor) => {
    setDocsDe(d); setDocs([]); setDocForm(DOC_VAZIO);
    try { setDocs(await loadDoctorDocuments(d.id)); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar documentos."); }
  };
  const salvarDoc = async () => {
    if (!docsDe || !docForm.title.trim()) return;
    setBusy(true);
    try { await addDoctorDocument(docsDe.id, docForm); setDocs(await loadDoctorDocuments(docsDe.id)); setDocForm(DOC_VAZIO); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao registrar documento."); }
    finally { setBusy(false); }
  };
  const apagarDoc = async (id: string) => {
    if (!docsDe || !window.confirm("Arquivar este documento?")) return;
    try { await removeDoctorDocument(docsDe.id, id); setDocs(await loadDoctorDocuments(docsDe.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao arquivar."); }
  };

  const vencimento = (d: DoctorDocument) => {
    if (!d.expiresAt) return null;
    const dias = Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 86400000);
    if (dias < 0) return <Chip size="small" color="error" label={`Vencido há ${Math.abs(dias)} dia(s)`} />;
    if (dias <= 30) return <Chip size="small" color="warning" label={`Vence em ${dias} dia(s)`} />;
    return <Chip size="small" variant="outlined" label={`Válido até ${dataBR(d.expiresAt)}`} />;
  };

  const divide = form.revenueModel === "PARTICIPACAO";
  const campo = (k: keyof typeof VAZIO, label: string, extra: Record<string, unknown> = {}) => (
    <TextField label={label} value={String(form[k] ?? "")} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...extra} />
  );
  const seletor = (k: keyof typeof VAZIO, label: string, lista: Array<[string, string]>, extra: Record<string, unknown> = {}) => (
    <TextField select label={label} value={String(form[k] ?? "")} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...extra}>
      {lista.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
    </TextField>
  );

  return (
    <Box>
      <PageHeader title={"Corpo Clínico"} description={"Profissionais da clínica: identificação, CRO, dados de PJ, modelo de remuneração e documentos."} actionLabel="Novo profissional" actionIcon={<AddIcon />} onAction={abrirNovo} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {loading ? <Typography sx={{ p: 3 }}>Carregando...</Typography>
          : rows.length === 0 ? <Typography sx={{ p: 3 }} color="text.secondary">{"Nenhum profissional cadastrado. Use “Novo profissional”."}</Typography>
          : rows.map((d) => (
            <Box key={d.id} sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1.4fr 1.2fr auto" }, gap: 2, alignItems: "center" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{nomeDe(d)}</Typography>
                <Typography variant="body2" color="text.secondary">{[`CRO ${d.cro}${d.croState ? `/${d.croState}` : ""}`, (d.specialties && d.specialties.length ? d.specialties.join(", ") : d.specialty)].filter(Boolean).join(" • ")}</Typography>
              </Box>
              <Box>
                <Chip size="small" label={rotulo(VINCULOS, d.contractType)} />
                {d.cnpj && <Typography variant="body2" color="text.secondary">{`CNPJ ${d.cnpj}`}</Typography>}
              </Box>
              <Box>
                <Typography variant="body2">{d.revenueModel === "PARTICIPACAO" ? `Participação ${d.revenuePercent ?? 0}%` : d.revenueModel === "LOCACAO" ? "Locação de espaço" : "Honorário"}</Typography>
                <Typography variant="caption" color="text.secondary">{d.documentIssuer === "PROFISSIONAL" ? "Documentos em nome do profissional" : "Documentos em nome da clínica"}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" onClick={() => abrirEdicao(d)}>Editar</Button>
                <Button size="small" startIcon={<BadgeIcon />} onClick={() => void abrirDocs(d)}>Documentos</Button>
              </Box>
            </Box>
          ))}
      </Paper>

      <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} fullWidth maxWidth="md">
        <DialogTitle>{editId ? "Editar profissional" : "Novo profissional"}</DialogTitle>
        <DialogContent dividers>
          <Tabs value={aba} onChange={(_, v) => setAba(v)} sx={{ mb: 2 }} variant="scrollable">
            <Tab label={"Identificação"} /><Tab label={"Pessoa jurídica"} /><Tab label={"Remuneração"} /><Tab label="Banco" />
          </Tabs>
          {aba === 0 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {!editId && (
                <TextField select required label={"Usuário do sistema"} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} sx={{ gridColumn: { md: "1/-1" } }} helperText={"O profissional precisa de um usuário para ter acesso e agenda."}>
                  {users.map((u) => <MenuItem key={u.id} value={u.id}>{`${u.firstName} ${u.lastName} — ${u.email}`}</MenuItem>)}
                </TextField>
              )}
              {seletor("contractType", "Vínculo", VINCULOS)}
              {seletor("documentIssuer", "Documentos do paciente em nome de", [["CLINICA","Clínica"],["PROFISSIONAL","Profissional"]], { helperText: "Define o cabeçalho dos contratos e termos." })}
              {campo("cro", "CRO", { required: true })}
              {campo("croState", "UF do CRO")}
              {campo("rqe", "RQE / registro de especialista")}
              {campo("consultationValue", "Valor da consulta (R$)")}
              <Autocomplete multiple freeSolo options={ESPECIALIDADES} value={form.specialties} onChange={(_, v) => setForm({ ...form, specialties: v.map(String) })} sx={{ gridColumn: { md: "1/-1" } }} renderInput={(p) => <TextField {...p} label="Especialidades" helperText="Digite e pressione Enter para adicionar" />} />
              {campo("cpf", "CPF")}
              {campo("rg", "RG")}
              {campo("birthDate", "Nascimento", { type: "date", slotProps: { inputLabel: { shrink: true } } })}
              {campo("personalZipCode", "CEP")}
              {campo("personalAddress", "Endereço", { sx: { gridColumn: { md: "1/-1" } } })}
              {campo("personalCity", "Cidade")}
              {campo("personalState", "UF")}
              {campo("contractStartDate", "Início do contrato", { type: "date", slotProps: { inputLabel: { shrink: true } } })}
              {campo("contractEndDate", "Fim do contrato", { type: "date", slotProps: { inputLabel: { shrink: true } } })}
              {campo("notes", "Observações", { multiline: true, minRows: 2, sx: { gridColumn: { md: "1/-1" } } })}
            </Box>
          )}
          {aba === 1 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Alert severity="info" sx={{ gridColumn: { md: "1/-1" } }}>{"Preencha quando o profissional atender como pessoa jurídica. Estes dados vão para o cabeçalho dos documentos e para a nota fiscal."}</Alert>
              {campo("companyName", "Razão social", { sx: { gridColumn: { md: "1/-1" } } })}
              {campo("tradeName", "Nome fantasia")}
              {campo("cnpj", "CNPJ")}
              {campo("companyCro", "CRO da pessoa jurídica")}
              {campo("technicalManager", "Responsável técnico")}
              {campo("municipalRegistration", "Inscrição municipal")}
              {campo("companyZipCode", "CEP")}
              {campo("companyAddress", "Endereço", { sx: { gridColumn: { md: "1/-1" } } })}
              {campo("companyCity", "Cidade")}
              {campo("companyState", "UF")}
            </Box>
          )}
          {aba === 2 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {seletor("revenueModel", "Modelo de remuneração", MODELOS, { sx: { gridColumn: { md: "1/-1" } } })}
              {divide && <Alert severity="warning" sx={{ gridColumn: { md: "1/-1" } }}>{"Na participação, o orçamento aprovado gera duas cobranças: uma da clínica e uma do profissional, cada uma com a própria nota fiscal."}</Alert>}
              {divide && campo("revenuePercent", "Percentual do profissional (%)", { helperText: "O restante fica com a clínica." })}
              {divide && seletor("revenueBase", "Base de cálculo", BASES)}
              {divide && seletor("materialSplit", "Material", RATEIOS)}
              {divide && seletor("labSplit", "Laboratório de prótese", RATEIOS)}
              {divide && seletor("cardFeeSplit", "Taxas de cartão e boleto", RATEIOS)}
              {!divide && campo("commissionPercent", "Honorário / comissão (%)", { helperText: "Deixe em branco se o pagamento for por valor fixo." })}
              {campo("payoutDay", "Dia do repasse")}
            </Box>
          )}
          {aba === 3 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {campo("bankName", "Banco")}
              {campo("bankAgency", "Agência")}
              {campo("bankAccount", "Conta")}
              {campo("pixKey", "Chave PIX")}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy} onClick={() => void salvar()}>{busy ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(docsDe)} onClose={() => setDocsDe(null)} fullWidth maxWidth="md">
        <DialogTitle>{docsDe ? `Documentos • ${nomeDe(docsDe)}` : ""}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>{"Registre os documentos obrigatórios e a validade de cada um. O sistema avisa quando estiver perto de vencer."}</Alert>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 2 }}>
            <TextField select label="Tipo" value={docForm.documentType} onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })}>
              {TIPOS_DOC.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            <TextField required label={"Título / número"} value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
            <TextField label={"Emissão"} type="date" slotProps={{ inputLabel: { shrink: true } }} value={docForm.issueDate} onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })} />
            <TextField label="Validade" type="date" slotProps={{ inputLabel: { shrink: true } }} value={docForm.expiresAt} onChange={(e) => setDocForm({ ...docForm, expiresAt: e.target.value })} />
            <TextField label={"Observação"} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} sx={{ gridColumn: { md: "1/-1" } }} />
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} disabled={busy || !docForm.title.trim()} onClick={() => void salvarDoc()}>Registrar documento</Button>
          <Box sx={{ mt: 3, display: "grid", gap: 1 }}>
            {docs.length === 0 ? <Typography color="text.secondary">Nenhum documento registrado.</Typography> : docs.map((d) => (
              <Paper key={d.id} variant="outlined" sx={{ p: 2, borderRadius: 2, display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{d.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{rotulo(TIPOS_DOC, d.documentType)}{d.issueDate ? ` • emitido em ${dataBR(d.issueDate)}` : ""}</Typography>
                  {d.notes && <Typography variant="body2" color="text.secondary">{d.notes}</Typography>}
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  {vencimento(d)}
                  <Button size="small" color="error" startIcon={<DeleteOutlinedIcon />} onClick={() => void apagarDoc(d.id)}>Arquivar</Button>
                </Box>
              </Paper>
            ))}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setDocsDe(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
import { useCallback, useEffect, useState } from "react";
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import BadgeIcon from "@mui/icons-material/Badge";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import PageHeader from "../components/PageHeader";
import { addDoctorDocument, createDoctor, loadClinicUsers, loadDoctorDocuments, loadDoctors, removeDoctorDocument, updateDoctor, type Doctor, type DoctorDocument, type DoctorUser } from "../services/DoctorApi";

const VINCULOS: Array<[string, string]> = [["CLINICA","S\u00f3cio / da cl\u00ednica"],["CLT","CLT"],["PJ","PJ contratado"],["AUTONOMO","Aut\u00f4nomo"],["LOCACAO","Loca\u00e7\u00e3o de espa\u00e7o"]];
const MODELOS: Array<[string, string]> = [["HONORARIO","Honor\u00e1rio (a cl\u00ednica cobra o paciente e paga o profissional)"],["PARTICIPACAO","Participa\u00e7\u00e3o na receita (cobran\u00e7a dividida entre as partes)"],["LOCACAO","Loca\u00e7\u00e3o de espa\u00e7o (o profissional cobra o paciente e paga a cl\u00ednica)"]];
const BASES: Array<[string, string]> = [["BRUTO","Sobre o valor bruto do procedimento"],["LIQUIDO","Sobre o l\u00edquido (ap\u00f3s material, laborat\u00f3rio e taxas)"]];
const RATEIOS: Array<[string, string]> = [["RATEADO","Rateado no mesmo percentual"],["PROFISSIONAL","Por conta do profissional"],["CLINICA","Por conta da cl\u00ednica"]];
const ESPECIALIDADES = ["Cl\u00ednica geral","Implantodontia","Pr\u00f3tese","Ortodontia","Endodontia","Periodontia","Odontopediatria","Cirurgia","Dent\u00edstica","Est\u00e9tica","Harmoniza\u00e7\u00e3o orofacial","DTM e dor orofacial","Radiologia","Odontogeriatria"];
const TIPOS_DOC: Array<[string, string]> = [["RG_CPF","RG / CPF"],["ENDERECO","Comprovante de endere\u00e7o"],["DIPLOMA","Diploma"],["CRO","Carteira do CRO"],["CRO_REGULARIDADE","Certid\u00e3o de regularidade do CRO"],["ESPECIALIZACAO","T\u00edtulo de especialista"],["CNPJ","Cart\u00e3o CNPJ"],["CONTRATO_SOCIAL","Contrato social"],["ALVARA","Alvar\u00e1 de funcionamento"],["ALVARA_SANITARIO","Alvar\u00e1 sanit\u00e1rio"],["RESP_TECNICA","Responsabilidade t\u00e9cnica"],["CONTRATO_PRESTACAO","Contrato de presta\u00e7\u00e3o de servi\u00e7o"],["SEGURO","Seguro de responsabilidade civil"],["OUTRO","Outro"]];

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
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o corpo cl\u00ednico."); }
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
      const payload: Record<string, unknown> = { ...form, specialty: form.specialty || form.specialties[0] || "Cl\u00ednica geral" };
      if (editId) { delete payload.userId; await updateDoctor(editId, payload); }
      else {
        if (!form.userId) { setError("Escolha o usu\u00e1rio do sistema ligado a este profissional."); setBusy(false); return; }
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
    if (dias < 0) return <Chip size="small" color="error" label={`Vencido h\u00e1 ${Math.abs(dias)} dia(s)`} />;
    if (dias <= 30) return <Chip size="small" color="warning" label={`Vence em ${dias} dia(s)`} />;
    return <Chip size="small" variant="outlined" label={`V\u00e1lido at\u00e9 ${dataBR(d.expiresAt)}`} />;
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
      <PageHeader title={"Corpo Cl\u00ednico"} description={"Profissionais da cl\u00ednica: identifica\u00e7\u00e3o, CRO, dados de PJ, modelo de remunera\u00e7\u00e3o e documentos."} actionLabel="Novo profissional" actionIcon={<AddIcon />} onAction={abrirNovo} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {loading ? <Typography sx={{ p: 3 }}>Carregando...</Typography>
          : rows.length === 0 ? <Typography sx={{ p: 3 }} color="text.secondary">{"Nenhum profissional cadastrado. Use \u201cNovo profissional\u201d."}</Typography>
          : rows.map((d) => (
            <Box key={d.id} sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1.4fr 1.2fr auto" }, gap: 2, alignItems: "center" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{nomeDe(d)}</Typography>
                <Typography variant="body2" color="text.secondary">{[`CRO ${d.cro}${d.croState ? `/${d.croState}` : ""}`, (d.specialties && d.specialties.length ? d.specialties.join(", ") : d.specialty)].filter(Boolean).join(" \u2022 ")}</Typography>
              </Box>
              <Box>
                <Chip size="small" label={rotulo(VINCULOS, d.contractType)} />
                {d.cnpj && <Typography variant="body2" color="text.secondary">{`CNPJ ${d.cnpj}`}</Typography>}
              </Box>
              <Box>
                <Typography variant="body2">{d.revenueModel === "PARTICIPACAO" ? `Participa\u00e7\u00e3o ${d.revenuePercent ?? 0}%` : d.revenueModel === "LOCACAO" ? "Loca\u00e7\u00e3o de espa\u00e7o" : "Honor\u00e1rio"}</Typography>
                <Typography variant="caption" color="text.secondary">{d.documentIssuer === "PROFISSIONAL" ? "Documentos em nome do profissional" : "Documentos em nome da cl\u00ednica"}</Typography>
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
            <Tab label={"Identifica\u00e7\u00e3o"} /><Tab label={"Pessoa jur\u00eddica"} /><Tab label={"Remunera\u00e7\u00e3o"} /><Tab label="Banco" />
          </Tabs>
          {aba === 0 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {!editId && (
                <TextField select required label={"Usu\u00e1rio do sistema"} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} sx={{ gridColumn: { md: "1/-1" } }} helperText={"O profissional precisa de um usu\u00e1rio para ter acesso e agenda."}>
                  {users.map((u) => <MenuItem key={u.id} value={u.id}>{`${u.firstName} ${u.lastName} \u2014 ${u.email}`}</MenuItem>)}
                </TextField>
              )}
              {seletor("contractType", "V\u00ednculo", VINCULOS)}
              {seletor("documentIssuer", "Documentos do paciente em nome de", [["CLINICA","Cl\u00ednica"],["PROFISSIONAL","Profissional"]], { helperText: "Define o cabe\u00e7alho dos contratos e termos." })}
              {campo("cro", "CRO", { required: true })}
              {campo("croState", "UF do CRO")}
              {campo("rqe", "RQE / registro de especialista")}
              {campo("consultationValue", "Valor da consulta (R$)")}
              <Autocomplete multiple freeSolo options={ESPECIALIDADES} value={form.specialties} onChange={(_, v) => setForm({ ...form, specialties: v.map(String) })} sx={{ gridColumn: { md: "1/-1" } }} renderInput={(p) => <TextField {...p} label="Especialidades" helperText="Digite e pressione Enter para adicionar" />} />
              {campo("cpf", "CPF")}
              {campo("rg", "RG")}
              {campo("birthDate", "Nascimento", { type: "date", slotProps: { inputLabel: { shrink: true } } })}
              {campo("personalZipCode", "CEP")}
              {campo("personalAddress", "Endere\u00e7o", { sx: { gridColumn: { md: "1/-1" } } })}
              {campo("personalCity", "Cidade")}
              {campo("personalState", "UF")}
              {campo("contractStartDate", "In\u00edcio do contrato", { type: "date", slotProps: { inputLabel: { shrink: true } } })}
              {campo("contractEndDate", "Fim do contrato", { type: "date", slotProps: { inputLabel: { shrink: true } } })}
              {campo("notes", "Observa\u00e7\u00f5es", { multiline: true, minRows: 2, sx: { gridColumn: { md: "1/-1" } } })}
            </Box>
          )}
          {aba === 1 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Alert severity="info" sx={{ gridColumn: { md: "1/-1" } }}>{"Preencha quando o profissional atender como pessoa jur\u00eddica. Estes dados v\u00e3o para o cabe\u00e7alho dos documentos e para a nota fiscal."}</Alert>
              {campo("companyName", "Raz\u00e3o social", { sx: { gridColumn: { md: "1/-1" } } })}
              {campo("tradeName", "Nome fantasia")}
              {campo("cnpj", "CNPJ")}
              {campo("companyCro", "CRO da pessoa jur\u00eddica")}
              {campo("technicalManager", "Respons\u00e1vel t\u00e9cnico")}
              {campo("municipalRegistration", "Inscri\u00e7\u00e3o municipal")}
              {campo("companyZipCode", "CEP")}
              {campo("companyAddress", "Endere\u00e7o", { sx: { gridColumn: { md: "1/-1" } } })}
              {campo("companyCity", "Cidade")}
              {campo("companyState", "UF")}
            </Box>
          )}
          {aba === 2 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {seletor("revenueModel", "Modelo de remunera\u00e7\u00e3o", MODELOS, { sx: { gridColumn: { md: "1/-1" } } })}
              {divide && <Alert severity="warning" sx={{ gridColumn: { md: "1/-1" } }}>{"Na participa\u00e7\u00e3o, o or\u00e7amento aprovado gera duas cobran\u00e7as: uma da cl\u00ednica e uma do profissional, cada uma com a pr\u00f3pria nota fiscal."}</Alert>}
              {divide && campo("revenuePercent", "Percentual do profissional (%)", { helperText: "O restante fica com a cl\u00ednica." })}
              {divide && seletor("revenueBase", "Base de c\u00e1lculo", BASES)}
              {divide && seletor("materialSplit", "Material", RATEIOS)}
              {divide && seletor("labSplit", "Laborat\u00f3rio de pr\u00f3tese", RATEIOS)}
              {divide && seletor("cardFeeSplit", "Taxas de cart\u00e3o e boleto", RATEIOS)}
              {!divide && campo("commissionPercent", "Honor\u00e1rio / comiss\u00e3o (%)", { helperText: "Deixe em branco se o pagamento for por valor fixo." })}
              {campo("payoutDay", "Dia do repasse")}
            </Box>
          )}
          {aba === 3 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {campo("bankName", "Banco")}
              {campo("bankAgency", "Ag\u00eancia")}
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
        <DialogTitle>{docsDe ? `Documentos \u2022 ${nomeDe(docsDe)}` : ""}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>{"Registre os documentos obrigat\u00f3rios e a validade de cada um. O sistema avisa quando estiver perto de vencer."}</Alert>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 2 }}>
            <TextField select label="Tipo" value={docForm.documentType} onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })}>
              {TIPOS_DOC.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            <TextField required label={"T\u00edtulo / n\u00famero"} value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
            <TextField label={"Emiss\u00e3o"} type="date" slotProps={{ inputLabel: { shrink: true } }} value={docForm.issueDate} onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })} />
            <TextField label="Validade" type="date" slotProps={{ inputLabel: { shrink: true } }} value={docForm.expiresAt} onChange={(e) => setDocForm({ ...docForm, expiresAt: e.target.value })} />
            <TextField label={"Observa\u00e7\u00e3o"} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} sx={{ gridColumn: { md: "1/-1" } }} />
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} disabled={busy || !docForm.title.trim()} onClick={() => void salvarDoc()}>Registrar documento</Button>
          <Box sx={{ mt: 3, display: "grid", gap: 1 }}>
            {docs.length === 0 ? <Typography color="text.secondary">Nenhum documento registrado.</Typography> : docs.map((d) => (
              <Paper key={d.id} variant="outlined" sx={{ p: 2, borderRadius: 2, display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{d.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{rotulo(TIPOS_DOC, d.documentType)}{d.issueDate ? ` \u2022 emitido em ${dataBR(d.issueDate)}` : ""}</Typography>
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
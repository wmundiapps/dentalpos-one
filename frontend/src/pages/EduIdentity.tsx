import { Alert, Box, Button, Chip, Divider, IconButton, Paper, Snackbar, TextField, Tooltip, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SaveIcon from "@mui/icons-material/Save";
import { useCallback, useEffect, useRef, useState } from "react";
import EduShell from "../edu/EduShell";
import { atributoAccept, erroDeUpload, validarArquivo } from "../security/uploadGuard";
import { eduApi, loadBranding } from "../services/EduApi";

const KINDS: Array<{ kind: string; label: string; help: string }> = [
  { kind: "LOGO_PRINCIPAL", label: "Logomarca principal", help: "Fundo claro. Usada no cabeçalho, portal do aluno e documentos." },
  { kind: "LOGO_HORIZONTAL", label: "Logomarca horizontal", help: "Versão em linha, para barras e e-mails." },
  { kind: "LOGO_ESCURA", label: "Logomarca para fundo escuro", help: "Versão branca/clara para menu escuro e capas." },
  { kind: "LOGO_MONOCROMATICA", label: "Monocromática", help: "Para impressão em preto e branco e marca d'água." },
  { kind: "BRASAO", label: "Brasão / símbolo", help: "Ícone isolado da instituição." },
  { kind: "SELO_CERTIFICADO", label: "Selo de certificados", help: "Aplicado em certificados e diplomas." },
  { kind: "MARCA_DAGUA", label: "Marca d'água", help: "Fundo translúcido em documentos." },
  { kind: "FAVICON", label: "Ícone (favicon)", help: "Quadrado, pequeno." },
  { kind: "ASSINATURA", label: "Assinatura do reitor/diretor", help: "Imagem da assinatura para certificados." },
  { kind: "CABECALHO_DOCUMENTO", label: "Cabeçalho de documentos", help: "Faixa completa opcional." },
  { kind: "RODAPE_DOCUMENTO", label: "Rodapé de documentos", help: "Faixa completa opcional." },
];

const FIELDS: Array<[string, string]> = [
  ["nome", "Nome da instituição"], ["sigla", "Sigla"], ["mantenedora", "Mantenedora"], ["cnpj", "CNPJ"], ["codigoEmec", "Código e-MEC"],
  ["categoria", "Categoria (Universidade, Centro Universitário, Faculdade…)"], ["email", "E-mail"], ["telefone", "Telefone"], ["site", "Site"],
  ["endereco", "Endereço"], ["cidade", "Cidade"], ["uf", "UF"], ["reitorNome", "Reitor(a) / Diretor(a)"], ["reitorCargo", "Cargo"], ["lema", "Lema"],
  ["portariaCredenciamento", "Portaria de credenciamento"],
];

export default function EduIdentity() {
  const [form, setForm] = useState<Record<string, any>>({ corPrimaria: "#0F5FDB", corSecundaria: "#0B1F3A", corDestaque: "#21C7A8" });
  const [assets, setAssets] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string>("LOGO_PRINCIPAL");

  const load = useCallback(async () => {
    try {
      const [inst, list] = await Promise.all([eduApi.get("/core/instituicao"), eduApi.get("/core/marca")]);
      if (inst) setForm((f) => ({ ...f, ...inst }));
      setAssets(list.filter((a: any) => a.ativo));
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    try {
      const body: Record<string, any> = {};
      FIELDS.forEach(([k]) => { if (form[k] !== undefined && form[k] !== null && form[k] !== "") body[k] = form[k]; });
      ["corPrimaria", "corSecundaria", "corDestaque"].forEach((k) => { body[k] = form[k]; });
      await eduApi.put("/core/instituicao", body);
      await loadBranding(true);
      setMsg({ type: "success", text: "Identidade salva." });
    } catch (e: any) { setMsg({ type: "error", text: e.message }); }
  }

  function pick(kind: string) { setPending(kind); fileRef.current?.click(); }

  async function onFile(file?: File | null) {
    if (!file) return;
    const invalido = await validarArquivo(file, { tipos: ["imagem"], permitirSvg: true, maxBytes: 1_400_000 });
    if (invalido) { setMsg({ type: "error", text: invalido }); return; }
    const r = new FileReader();
    r.onload = async () => {
      try {
        await eduApi.post("/core/marca", { kind: pending, titulo: file.name, dataUrl: String(r.result) });
        await loadBranding(true);
        await load();
        setMsg({ type: "success", text: "Logomarca enviada." });
      } catch (e: any) { setMsg({ type: "error", text: erroDeUpload(e, "Não foi possível enviar a logomarca.") }); }
    };
    r.readAsDataURL(file);
  }

  async function remove(id: string) {
    await eduApi.del(`/core/marca/${id}`);
    await loadBranding(true);
    load();
  }

  return (
    <EduShell title="Identidade e logomarcas" subtitle="Nome, cores e todas as variações da logomarca usadas no portal, certificados e documentos." onLogoClick={() => pick("LOGO_PRINCIPAL")}
      actions={<Button variant="contained" color="inherit" startIcon={<SaveIcon />} onClick={save} sx={{ bgcolor: "#fff", color: "#0B1F3A" }}>Salvar identidade</Button>}>
      <input ref={fileRef} type="file" accept={atributoAccept(["imagem"], true)} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Dados da instituição</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
          {FIELDS.map(([k, label]) => (
            <TextField key={k} size="small" label={label} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
        </Box>
        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Cores institucionais</Typography>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {[["corPrimaria", "Primária"], ["corSecundaria", "Secundária"], ["corDestaque", "Destaque"]].map(([k, label]) => (
            <Box key={k} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <input type="color" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ width: 44, height: 36, border: 0, background: "none" }} />
              <Typography variant="body2">{label} <b>{form[k]}</b></Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Typography variant="h6" sx={{ mb: 1 }}>Logomarcas e ativos de marca</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
        {KINDS.map(({ kind, label, help }) => {
          const a = assets.find((x) => x.kind === kind);
          const src = a?.dataUrl || a?.url;
          return (
            <Paper key={kind} variant="outlined" sx={{ p: 2, borderRadius: 3, display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Typography sx={{ fontWeight: 800 }}>{label}</Typography>
                {a ? <Chip size="small" color="success" label="enviada" /> : <Chip size="small" label="pendente" />}
              </Box>
              <Box sx={{ height: 120, borderRadius: 2, border: "1px dashed", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%),linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,8px 8px" }}>
                {src ? <Box component="img" src={src} alt={label} sx={{ maxHeight: 108, maxWidth: "92%", objectFit: "contain" }} /> : <Typography variant="caption" color="text.secondary">Sem imagem</Typography>}
              </Box>
              <Typography variant="caption" color="text.secondary">{help}</Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => pick(kind)}>{a ? "Substituir" : "Enviar"}</Button>
                {a ? <Tooltip title="Remover"><IconButton size="small" onClick={() => remove(a.id)}><DeleteOutlinedIcon /></IconButton></Tooltip> : null}
              </Box>
            </Paper>
          );
        })}
      </Box>
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </EduShell>
  );
}

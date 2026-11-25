import { Alert, Box, Button, Chip, MenuItem, Paper, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { eduApi } from "../../services/EduApi";

const PASSOS = ["Dados do curso", "Processo e-MEC", "Checklist de autorização", "Concluído"];
const MODALIDADES = ["PRESENCIAL", "EAD", "SEMIPRESENCIAL"];

/**
 * Monta, em um único fluxo guiado, o que hoje exige três telas separadas: cria o curso (AcademicProgram),
 * abre o processo de Autorização de Curso no Regulatório e já anexa o checklist com os critérios de
 * aceitação do e-MEC/INEP (modelo "autorizacao-curso", mantido em regulatorio/catalogo.ts).
 */
export default function MontadorCursoTab() {
  const navigate = useNavigate();
  const [passo, setPasso] = useState(0);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [f, setF] = useState({ nome: "", modalidade: "PRESENCIAL", cargaHorariaTotal: "", vagasSolicitadas: "" });
  const [resultado, setResultado] = useState<{ programId: string; processoId: string; checklistId: string; prontidao: number } | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function montar() {
    setErro("");
    if (!f.nome.trim() || !f.cargaHorariaTotal) { setErro("Informe o nome do curso e a carga horária total."); return; }
    setBusy(true);
    try {
      setPasso(1);
      const program = await eduApi.post("/academico/programs", {
        nome: f.nome.trim(), modalidade: f.modalidade, cargaHorariaTotal: Number(f.cargaHorariaTotal),
      });
      setPasso(2);
      const processo = await eduApi.post("/regulatorio/processos", {
        tipo: "AUTORIZACAO_CURSO", titulo: `Autorização de curso — ${f.nome.trim()}`, programId: program.id,
        cursoNome: f.nome.trim(), vagasSolicitadas: f.vagasSolicitadas ? Number(f.vagasSolicitadas) : undefined,
      });
      // Garante que o catálogo de modelos de checklist (critérios do e-MEC) já existe neste tenant — idempotente.
      await eduApi.post("/regulatorio/bootstrap", {});
      const checklist = await eduApi.post("/regulatorio/checklists", {
        chave: "autorizacao-curso", nome: `Autorização e-MEC — ${f.nome.trim()}`, processoId: processo.id, programId: program.id,
      });
      setResultado({ programId: program.id, processoId: processo.id, checklistId: checklist.id, prontidao: checklist.prontidao ?? 0 });
      setPasso(3);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível montar o curso.");
      setPasso(0);
    } finally {
      setBusy(false);
    }
  }

  function recomecar() {
    setF({ nome: "", modalidade: "PRESENCIAL", cargaHorariaTotal: "", vagasSolicitadas: "" });
    setResultado(null);
    setErro("");
    setPasso(0);
  }

  return (
    <Box sx={{ maxWidth: 760 }}>
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, mb: 3, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <SchoolOutlinedIcon color="primary" />
        <Typography variant="body2" color="text.secondary">
          Cria o curso, abre o processo de Autorização no Regulatório e já anexa a lista de documentos/requisitos exigidos
          pelo e-MEC para autorizar um curso novo (PPC, NDE, corpo docente, laboratórios, biblioteca...). Depois de montado,
          acompanhe cada item na aba "Checklists".
        </Typography>
      </Paper>

      <Stepper activeStep={passo} sx={{ mb: 3 }}>
        {PASSOS.map((p) => <Step key={p}><StepLabel>{p}</StepLabel></Step>)}
      </Stepper>

      {erro ? <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert> : null}

      {passo === 0 && !resultado ? (
        <Box sx={{ display: "grid", gap: 2 }}>
          <TextField size="small" label="Nome do curso" value={f.nome} onChange={(e) => set("nome", e.target.value)} required autoFocus />
          <TextField size="small" select label="Modalidade" value={f.modalidade} onChange={(e) => set("modalidade", e.target.value)}>
            {MODALIDADES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label="Carga horária total (horas)" value={f.cargaHorariaTotal} onChange={(e) => set("cargaHorariaTotal", e.target.value)} required />
          <TextField size="small" type="number" label="Vagas solicitadas (opcional)" value={f.vagasSolicitadas} onChange={(e) => set("vagasSolicitadas", e.target.value)} />
          <Box>
            <Button variant="contained" disabled={busy} onClick={montar}>{busy ? "Montando..." : "Montar curso"}</Button>
          </Box>
        </Box>
      ) : null}

      {passo > 0 && passo < 3 && !resultado ? (
        <Typography color="text.secondary">Montando... ({PASSOS[passo]})</Typography>
      ) : null}

      {resultado ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 3, display: "grid", gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Curso montado com sucesso</Typography>
          <Typography variant="body2" color="text.secondary">
            O processo de Autorização de Curso foi aberto e o checklist com os critérios do e-MEC já está pronto para ser trabalhado.
          </Typography>
          <Chip sx={{ alignSelf: "flex-start" }} label={`Prontidão atual do checklist: ${resultado.prontidao}%`} color={resultado.prontidao > 0 ? "warning" : "default"} />
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <Button variant="contained" onClick={() => navigate(`/edu/regulatorio?aba=checklists`)}>Ver checklist e-MEC</Button>
            <Button onClick={() => navigate(`/edu/regulatorio?aba=processos`)}>Ver processo</Button>
            <Button color="inherit" onClick={recomecar}>Montar outro curso</Button>
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}

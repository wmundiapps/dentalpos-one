import { useState } from "react";
import { Alert, Autocomplete, Box, Button, Paper, Snackbar, Tab, Tabs, TextField, Typography } from "@mui/material";
import { eduApi, EduApiError } from "../../services/EduApi";
import { useLoad } from "../secretaria/util";

type Aba = "ALUNO" | "PROFESSOR" | "GESTOR_POLO";

/**
 * Cria o acesso de aluno/professor/gestor de polo a partir de RA (aluno) ou nome (professor/gestor), com senha
 * inicial = data de nascimento e troca obrigatória no primeiro login. Reaproveita /academico/credenciais/*.
 */
export default function CriarAcessos() {
  const [aba, setAba] = useState<Aba>("ALUNO");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const [resultado, setResultado] = useState<any>(null);

  const [aluno, setAluno] = useState({ ra: "", nomeCompleto: "", email: "", dataNascimento: "", cpf: "" });
  const [professor, setProfessor] = useState({ nomeCompleto: "", email: "", dataNascimento: "" });
  const [gestor, setGestor] = useState<{ nomeCompleto: string; email: string; dataNascimento: string; polos: any[] }>({ nomeCompleto: "", email: "", dataNascimento: "", polos: [] });
  const polosDisp = useLoad<any>("/modalidades/polos?pageSize=200");

  async function enviar() {
    setBusy(true);
    setResultado(null);
    try {
      let r: any;
      if (aba === "ALUNO") {
        r = await eduApi.post("/academico/credenciais/aluno", { ...aluno, cpf: aluno.cpf || undefined });
        setAluno({ ra: "", nomeCompleto: "", email: "", dataNascimento: "", cpf: "" });
      } else if (aba === "PROFESSOR") {
        r = await eduApi.post("/academico/credenciais/professor", professor);
        setProfessor({ nomeCompleto: "", email: "", dataNascimento: "" });
      } else {
        r = await eduApi.post("/academico/credenciais/gestor-polo", { nomeCompleto: gestor.nomeCompleto, email: gestor.email, dataNascimento: gestor.dataNascimento, poloIds: gestor.polos.map((p) => p.id) });
        setGestor({ nomeCompleto: "", email: "", dataNascimento: "", polos: [] });
      }
      setResultado(r);
      setMsg({ tipo: "success", texto: "Acesso criado." });
    } catch (e) {
      setMsg({ tipo: "error", texto: e instanceof EduApiError ? e.message : "Falha ao criar o acesso." });
    } finally {
      setBusy(false);
    }
  }

  const podeEnviar =
    aba === "ALUNO" ? aluno.ra.trim() && aluno.nomeCompleto.trim().length > 2 && aluno.email.trim() && aluno.dataNascimento :
    aba === "PROFESSOR" ? professor.nomeCompleto.trim().length > 2 && professor.email.trim() && professor.dataNascimento :
    gestor.nomeCompleto.trim().length > 2 && gestor.email.trim() && gestor.dataNascimento && gestor.polos.length > 0;

  return (
    <Box sx={{ display: "grid", gap: 2, maxWidth: 560 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>Criar acesso</Typography>
      <Typography variant="body2" color="text.secondary">
        A senha inicial é a data de nascimento (DDMMAAAA); o sistema exige a troca no primeiro login.
      </Typography>
      <Tabs value={aba} onChange={(_, v) => { setAba(v); setResultado(null); }}>
        <Tab value="ALUNO" label="Aluno" />
        <Tab value="PROFESSOR" label="Professor" />
        <Tab value="GESTOR_POLO" label="Gestor de polo" />
      </Tabs>

      {aba === "ALUNO" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <TextField label="RA (registro acadêmico)" value={aluno.ra} onChange={(e) => setAluno({ ...aluno, ra: e.target.value })} />
          <TextField label="Nome completo" value={aluno.nomeCompleto} onChange={(e) => setAluno({ ...aluno, nomeCompleto: e.target.value })} />
          <TextField label="E-mail (para recuperação de senha)" type="email" value={aluno.email} onChange={(e) => setAluno({ ...aluno, email: e.target.value })} />
          <TextField label="Data de nascimento" type="date" slotProps={{ inputLabel: { shrink: true } }} value={aluno.dataNascimento} onChange={(e) => setAluno({ ...aluno, dataNascimento: e.target.value })} />
          <TextField label="CPF (opcional)" value={aluno.cpf} onChange={(e) => setAluno({ ...aluno, cpf: e.target.value })} />
        </Box>
      )}

      {aba === "PROFESSOR" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <TextField label="Nome completo" value={professor.nomeCompleto} onChange={(e) => setProfessor({ ...professor, nomeCompleto: e.target.value })} />
          <TextField label="E-mail (para recuperação de senha)" type="email" value={professor.email} onChange={(e) => setProfessor({ ...professor, email: e.target.value })} />
          <TextField label="Data de nascimento" type="date" slotProps={{ inputLabel: { shrink: true } }} value={professor.dataNascimento} onChange={(e) => setProfessor({ ...professor, dataNascimento: e.target.value })} />
        </Box>
      )}

      {aba === "GESTOR_POLO" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <TextField label="Nome completo" value={gestor.nomeCompleto} onChange={(e) => setGestor({ ...gestor, nomeCompleto: e.target.value })} />
          <TextField label="E-mail (para recuperação de senha)" type="email" value={gestor.email} onChange={(e) => setGestor({ ...gestor, email: e.target.value })} />
          <TextField label="Data de nascimento" type="date" slotProps={{ inputLabel: { shrink: true } }} value={gestor.dataNascimento} onChange={(e) => setGestor({ ...gestor, dataNascimento: e.target.value })} />
          <Autocomplete
            multiple
            options={polosDisp.data?.items ?? []}
            getOptionLabel={(p: any) => `${p.nome} (${p.codigo})`}
            value={gestor.polos}
            onChange={(_, v) => setGestor({ ...gestor, polos: v })}
            renderInput={(params) => <TextField {...params} label="Polos sob gestão" placeholder="Selecione um ou mais polos" />}
          />
          <Typography variant="caption" color="text.secondary">
            O gestor só verá os alunos, financeiro, atividades e cobrança dos polos selecionados aqui. Reitoria, diretoria EAD, financeiro e administração continuam vendo todos os polos.
          </Typography>
        </Box>
      )}

      <Button variant="contained" size="large" disabled={!podeEnviar || busy} onClick={enviar}>
        {busy ? "Criando..." : "Criar acesso"}
      </Button>

      {resultado && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Acesso criado — repasse estas informações à pessoa:</Typography>
          {resultado.loginInicial?.ra && <Typography variant="body2">RA: <b>{resultado.loginInicial.ra}</b></Typography>}
          {resultado.loginInicial?.loginAlt && <Typography variant="body2">Usuário: <b>{resultado.loginInicial.loginAlt}</b></Typography>}
          <Typography variant="body2">Senha inicial (trocar no 1º acesso): <b>{resultado.loginInicial?.senhaInicial}</b></Typography>
        </Paper>
      )}

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.tipo} onClose={() => setMsg(null)}>{msg.texto}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import EduShell from "../../edu/EduShell";
import { securityApi } from "../../services/SecurityApi";

/**
 * Dispositivos (Configurações / Segurança): login em equipamento nunca visto para aquele usuário fica pendente
 * até alguém com papel super aprovar ou recusar aqui. Mostra o navegador/SO detectado e o IP de origem.
 */
export default function EduDispositivos() {
  const [itens, setItens] = useState<any[]>([]);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string>("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const r = await securityApi.devices(mostrarTodos ? "todos" : "pendentes");
      setItens(r.items || []);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os dispositivos.");
    } finally {
      setLoading(false);
    }
  }, [mostrarTodos]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function agir(id: string, acao: "aprovar" | "recusar") {
    setOcupado(id);
    try {
      if (acao === "aprovar") await securityApi.aprovarDispositivo(id);
      else await securityApi.recusarDispositivo(id);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível concluir a ação.");
    } finally {
      setOcupado("");
    }
  }

  function nomeDe(u: any) {
    if (!u) return "Usuário removido";
    const nome = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    return nome || u.email;
  }

  return (
    <EduShell
      title="Dispositivos"
      subtitle="Login em um equipamento novo fica pendente até ser aprovado aqui. Isso ajuda a rastrear e impedir acesso indevido às demonstrações e ao ambiente de testes."
    >
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, mb: 2.5, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <DevicesOtherOutlinedIcon color="primary" />
        <Typography variant="body2" color="text.secondary">
          Cada navegador guarda um identificador próprio na primeira vez que acessa. Um login vindo de um identificador nunca visto para aquele usuário
          fica esperando aqui. Aprovado, o navegador fica lembrado e não pergunta de novo.
        </Typography>
      </Paper>

      {erro ? <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert> : null}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800 }}>{mostrarTodos ? "Todos os dispositivos" : "Pendentes de aprovação"}</Typography>
        <Button size="small" onClick={() => setMostrarTodos((v) => !v)}>
          {mostrarTodos ? "Ver só pendentes" : "Ver todos"}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress size={28} /></Box>
      ) : !itens.length ? (
        <Typography color="text.secondary">{mostrarTodos ? "Nenhum dispositivo registrado ainda." : "Nenhum dispositivo pendente agora."}</Typography>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Usuário</TableCell>
                <TableCell>Dispositivo</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Primeiro acesso</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {itens.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{nomeDe(d.usuario)}</TableCell>
                  <TableCell>{d.rotulo || "—"}</TableCell>
                  <TableCell>{d.ip || "—"}</TableCell>
                  <TableCell>{new Date(d.primeiraVezEm).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    {d.aprovado ? <Chip size="small" color="success" label="Aprovado" /> : d.recusado ? <Chip size="small" color="error" label="Recusado" /> : <Chip size="small" color="warning" label="Pendente" />}
                  </TableCell>
                  <TableCell align="right">
                    {!d.aprovado && (
                      <Button size="small" color="success" disabled={ocupado === d.id} onClick={() => agir(d.id, "aprovar")}>Aprovar</Button>
                    )}
                    {!d.recusado && (
                      <Button size="small" color="error" disabled={ocupado === d.id} onClick={() => agir(d.id, "recusar")}>Recusar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </EduShell>
  );
}

import { Alert, Box, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Light, Panel, Tag, brl, fmtDate, label, useToast } from "../infraestrutura/kit";
import { LeitorPicker } from "./pickers";

export function SituacaoLeitor({ s }: { s: any }) {
  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      <Light tone={s.podeEmprestar ? "success" : "error"} text={s.podeEmprestar ? "Apto a emprestar" : "Empréstimo bloqueado"} />
      {(s.motivosBloqueio || []).map((m: string, i: number) => <Typography key={i} variant="body2" color="error">• {m}</Typography>)}
      <Typography variant="body2">Empréstimos ativos: <b>{s.emprestimosAtivos}</b>{s.politica ? ` de ${s.politica.limiteEmprestimos}` : ""} · atrasados: <b>{s.atrasados?.length ?? s.atrasados ?? 0}</b> · multas em aberto: <b>{brl(s.multasAbertasValor)}</b></Typography>
      {s.politica && <Typography variant="caption" color="text.secondary">Prazo {s.politica.prazoDias} dia(s) · {s.politica.maxRenovacoes} renovação(ões) · multa {brl(s.politica.multaDia)}/dia</Typography>}
    </Box>
  );
}

export default function BalcaoPanel({ onChanged }: { onChanged: () => void }) {
  const [leitor, setLeitor] = useState<any | null>(null);
  const [sit, setSit] = useState<any | null>(null);
  const [tombo, setTombo] = useState("");
  const [forcar, setForcar] = useState(false);
  const [res, setRes] = useState<any | null>(null);
  const [tomboD, setTomboD] = useState("");
  const [dano, setDano] = useState(false);
  const [valorDano, setValorDano] = useState("");
  const [resD, setResD] = useState<any | null>(null);
  const toast = useToast();

  useEffect(() => {
    setSit(null); setRes(null);
    if (!leitor) return;
    eduApi.get(`/biblioteca/leitores/${leitor.id}/situacao`).then(setSit).catch((e) => toast.err(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leitor]);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
      <Panel title="Empréstimo" subtitle="Selecione o leitor e leia o tombo ou código de barras.">
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <LeitorPicker label="Leitor (nome, documento ou e-mail)" value={leitor} onChange={setLeitor} />
          {sit && <SituacaoLeitor s={sit} />}
          <TextField size="small" label="Tombo / código de barras" value={tombo} onChange={(e) => setTombo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }} />
          {sit && !sit.podeEmprestar && <FormControlLabel control={<Checkbox checked={forcar} onChange={(e) => setForcar(e.target.checked)} />} label="Forçar empréstimo (exceção do bibliotecário)" />}
          <Box><Button variant="contained" disabled={!leitor || !tombo.trim()} onClick={() => toast.run(async () => { const r = await eduApi.post("/biblioteca/emprestimos", { leitorId: leitor.id, tombo: tombo.trim(), forcar }); setRes(r); return r; }, "Empréstimo registrado.", () => { setTombo(""); setForcar(false); onChanged(); eduApi.get(`/biblioteca/leitores/${leitor.id}/situacao`).then(setSit).catch(() => {}); })}>Emprestar</Button></Box>
          {res && <Alert severity="success">Devolução prevista para <b>{fmtDate(res.dataPrevista)}</b>.</Alert>}
        </Box>
      </Panel>
      <Panel title="Devolução" subtitle="Leia o tombo do exemplar devolvido. Multas por atraso são calculadas automaticamente.">
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <TextField size="small" label="Tombo / código de barras" value={tomboD} onChange={(e) => setTomboD(e.target.value)} />
          <FormControlLabel control={<Checkbox checked={dano} onChange={(e) => setDano(e.target.checked)} />} label="Exemplar devolvido com dano" />
          {dano && <TextField size="small" type="number" label="Valor do dano (R$)" value={valorDano} onChange={(e) => setValorDano(e.target.value)} />}
          <Box><Button variant="contained" color="success" disabled={!tomboD.trim()} onClick={() => toast.run(async () => { const r = await eduApi.post("/biblioteca/emprestimos/devolver", { tombo: tomboD.trim(), danificado: dano, valorDano: dano && valorDano ? Number(valorDano) : undefined }); setResD(r); return r; }, "Devolução registrada.", () => { setTomboD(""); setDano(false); setValorDano(""); onChanged(); })}>Devolver</Button></Box>
          {resD && (
            <Alert severity={resD.multas?.length ? "warning" : "success"}>
              {resD.diasAtraso > 0 ? `Atraso de ${resD.diasAtraso} dia(s): multa ${brl(resD.multaAtraso)}${resD.multaLimitada ? " (limitada ao teto)" : ""}.` : "Devolvido no prazo."}
              {(resD.multas || []).map((m: any, i: number) => <div key={i}><Tag text={label(m.tipo)} tone="warning" /> {brl(m.valor)}</div>)}
            </Alert>
          )}
        </Box>
      </Panel>
      {toast.node}
    </Box>
  );
}

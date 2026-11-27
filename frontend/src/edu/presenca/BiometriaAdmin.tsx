import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StudentSearch } from "../secretaria/util";
import ListTable from "../infraestrutura/ListTable";
import { Async, Panel, Stat, StatGrid, Tag, fmtDateTime, label, num, useApi, useToast } from "../infraestrutura/kit";
import FaceCamera, { type CapturaFacial } from "./FaceCamera";

function Pessoa() {
  const [aluno, setAluno] = useState<{ id: string; nome: string; ra?: string } | null>(null);
  const [rk, setRk] = useState(0);
  const key = aluno ? `ALUNO:${aluno.id}` : null;
  const st = useApi<any>(key ? `/presenca/biometria/pessoas/${key}?r=${rk}` : null);
  const termo = useApi<any>("/presenca/biometria/termo");
  const [ciente, setCiente] = useState(false);
  const [captura, setCaptura] = useState(false);
  const toast = useToast();
  const s = st.data;
  async function consentirPresencial() {
    await toast.run(() => eduApi.post(`/presenca/biometria/pessoas/${key}/consentimento`, { versao: termo.data.termo.versao }), "Consentimento presencial registrado.", () => setRk((k) => k + 1));
  }
  async function cadastrar(c: CapturaFacial) {
    try { await eduApi.post(`/presenca/biometria/pessoas/${key}/cadastro`, { embeddings: c.embeddings, liveness: c.liveness, qualidade: c.qualidade, modelo: c.modelo }); toast.ok("Rosto cadastrado."); setCaptura(false); setRk((k) => k + 1); } catch (e: any) { toast.err(e.message); throw e; }
  }
  return (
    <Panel title="Cadastro presencial e exclusão" subtitle="Para quem prefere cadastrar na secretaria, ou para excluir a pedido do titular. Exige a presença do titular.">
      <Box sx={{ display: "grid", gap: 2, maxWidth: 620 }}>
        <StudentSearch value={aluno} onChange={(v) => { setAluno(v); setCaptura(false); setCiente(false); }} />
        {key && <Async state={st}>
          {() => s && (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Tag text={s.consentimento ? `Consentimento ${s.consentimento.canal.toLowerCase()}` : "Sem consentimento"} tone={s.consentimento ? "success" : "default"} />
                <Tag text={s.biometriaCadastrada ? `${s.amostras} amostra(s)` : "Sem rosto cadastrado"} tone={s.biometriaCadastrada ? "success" : "default"} />
                {s.credencialAlternativa && <Chip size="small" label={`Carteirinha ${s.credencialAlternativa.codigo}`} />}
              </Box>
              {!s.consentimento && (
                <>
                  <Alert severity="warning">Leia o termo ao titular (ou ao responsável legal, se menor de 18 anos). Só registre o consentimento se ele(a) concordar livremente; recusar não gera prejuízo.</Alert>
                  <Typography variant="body2" sx={{ maxHeight: 130, overflow: "auto", p: 1.5, border: 1, borderColor: "divider", borderRadius: 2 }}>{termo.data?.termo?.texto}</Typography>
                  <FormControlLabel control={<Checkbox checked={ciente} onChange={(e) => setCiente(e.target.checked)} />} label="O titular leu e consentiu presencialmente com o termo acima." />
                  <Box><Button variant="contained" disabled={!ciente || !termo.data?.termo} onClick={consentirPresencial}>Registrar consentimento presencial</Button></Box>
                </>
              )}
              {s.consentimento && !captura && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button variant="contained" onClick={() => setCaptura(true)}>{s.biometriaCadastrada ? "Refazer captura do rosto" : "Capturar rosto"}</Button></Box>}
              {captura && <FaceCamera modo="cadastrar" amostras={3} onCaptura={cadastrar} />}
              {(s.biometriaCadastrada || s.consentimento) && (
                <Box><Button color="error" onClick={() => { const m = window.prompt("Motivo da exclusão (mín. 5 caracteres):", "Pedido do titular"); if (m) toast.run(() => eduApi.del(`/presenca/biometria/pessoas/${key}?motivo=${encodeURIComponent(m)}`), "Biometria excluída e consentimento revogado.", () => setRk((k) => k + 1)); }}>Excluir biometria e revogar consentimento</Button></Box>
              )}
              <Box><Button onClick={() => toast.run(() => eduApi.post<any>(`/presenca/biometria/pessoas/${key}/credencial`, {}), "Nova carteirinha emitida.", (c) => { window.alert(`Código da carteirinha: ${c.codigo}`); setRk((k) => k + 1); })}>Emitir carteirinha (QR/código)</Button></Box>
            </Box>
          )}
        </Async>}
      </Box>
      {toast.node}
    </Panel>
  );
}

export default function BiometriaAdmin() {
  const p = useApi<any>("/presenca/biometria/painel");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={p}>
        {(d) => (
          <>
            <Alert severity="warning">Dado biométrico é <b>sensível</b> (LGPD art. 5º, II e 11). Consentimento específico e revogável, alternativa obrigatória, finalidade restrita a presença/acesso/empréstimo. Veja o RIPD em <code>docs/LGPD-RIPD-biometria.md</code>. Toda consulta nesta tela gera registro de acesso.</Alert>
            <StatGrid>
              <Stat label="Pessoas com rosto cadastrado" value={num(d.pessoasComBiometria, 0)} /><Stat label="Templates (cifrados)" value={num(d.templates, 0)} />
              <Stat label="Consentimentos ativos" value={num(d.consentimentosAtivos, 0)} tone="success" /><Stat label="Consentimentos revogados" value={num(d.consentimentosRevogados, 0)} />
              <Stat label="Carteirinhas (alternativa)" value={num(d.credenciaisAlternativas, 0)} />
              <Stat label="Comparações (24 h)" value={num(d.ultimas24h.comparacoes, 0)} hint={`${d.ultimas24h.falhas} sem sucesso`} /><Stat label="Bloqueios (24 h)" value={num(d.ultimas24h.bloqueios, 0)} tone={d.ultimas24h.bloqueios ? "warning" : "success"} />
            </StatGrid>
          </>
        )}
      </Async>
      <Pessoa />
      <Panel title="Log de uso da biometria" subtitle="Sem vetor e sem imagem: apenas ação, resultado, dispositivo e distância. Expurgado conforme a retenção configurada.">
        <ListTable path="/presenca/biometria/log" searchable={false} pageSize={20}
          filters={[{ key: "acao", label: "Ação", options: ["CADASTRO", "COMPARACAO", "REVOGACAO", "EXCLUSAO", "EXPURGO", "ADMIN_CONSULTA", "BLOQUEIO", "CONSENTIMENTO"] }, { key: "resultado", label: "Resultado", options: ["OK", "NAO_RECONHECIDO", "AMBIGUO", "LIVENESS_FALHOU", "BLOQUEADO"] }]}
          columns={[{ key: "createdAt", label: "Quando", render: (r) => fmtDateTime(r.createdAt) }, { key: "acao", label: "Ação", render: (r) => label(r.acao) }, { key: "resultado", label: "Resultado", render: (r) => label(r.resultado) },
            { key: "finalidade", label: "Finalidade", render: (r) => label(r.finalidade) }, { key: "distancia", label: "Distância", render: (r) => (r.distancia != null ? r.distancia.toFixed(3) : "—") }]} />
      </Panel>
    </Box>
  );
}

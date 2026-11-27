import { Alert, Box, Button, FormControlLabel, MenuItem, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Async, Panel, Sub, erroCompleto, useApi, useToast } from "./tes";
import { BOL, ehAdministracao } from "./boletosKit";

/** Configurações da caixa: e-mail dedicado (endereço, domínio, segredo do webhook), DDA e limites do check-up. */
export default function BoletosConfig({ onChanged }: { onChanged: () => void }) {
  const [k, setK] = useState(0);
  const st = useApi<any>(`${BOL}/config?_=${k}`);
  const admin = ehAdministracao();
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { if (st.data) setF({ ...st.data, dominioEmail: st.data.dominioEmail || "", ddaDocumento: st.data.ddaDocumento || "" }); }, [st.data]);

  async function salvar() {
    try {
      const body = { emailAtivo: f.emailAtivo, emailLocal: f.emailLocal, dominioEmail: f.dominioEmail || null, ddaAtivo: f.ddaAtivo, ddaProvedor: f.ddaProvedor, ddaDocumento: f.ddaDocumento || null, diasVencidoSuspeito: Number(f.diasVencidoSuspeito), fatorValorSuspeito: Number(f.fatorValorSuspeito), toleranciaDiasDuplicidade: Number(f.toleranciaDiasDuplicidade), prazoNotaDias: Number(f.prazoNotaDias), recorrenciaAprendizado: f.recorrenciaAprendizado };
      const r = await eduApi.put(`${BOL}/config`, body);
      if (r.tokenNovo) setToken(r.tokenNovo);
      toast.ok("Configuração salva."); setK((x) => x + 1); onChanged();
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  async function rotacionar() {
    if (!window.confirm("Gerar um novo segredo? O anterior deixa de funcionar e o serviço que encaminha os e-mails precisa ser atualizado.")) return;
    try { const r = await eduApi.post(`${BOL}/config/token`, {}); setToken(r.tokenNovo); toast.ok("Novo segredo gerado."); setK((x) => x + 1); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  const API = (import.meta.env.VITE_API_URL || "http://localhost:3000/api") as string;
  const set = (key: string) => (e: any) => setF({ ...f, [key]: e.target.value });

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {!admin && <Alert severity="info">Somente a administração/diretoria altera estas configurações; você pode consultá-las.</Alert>}
      <Async state={st}>
        {(c) => f && (
          <>
            <Panel title="E-mail exclusivo para boletos" subtitle="Os fornecedores enviam os boletos para este endereço; cada e-mail vira boleto recebido na caixa (sem autorizar pagamento).">
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <FormControlLabel sx={{ gridColumn: { md: "1 / -1" } }} control={<Switch checked={!!f.emailAtivo} disabled={!admin} onChange={(e) => setF({ ...f, emailAtivo: e.target.checked })} />} label="Caixa de e-mail dedicada ativa" />
                <TextField size="small" label="Parte antes do @" value={f.emailLocal} disabled={!admin} onChange={set("emailLocal")} />
                <TextField size="small" label="Domínio da instituição" value={f.dominioEmail} disabled={!admin} onChange={set("dominioEmail")} placeholder={c.dominioPadrao} helperText={`Vazio = domínio padrão (${c.dominioPadrao}; variável BOLETOS_DOMINIO_EMAIL)`} />
              </Box>
              <Alert severity="success" sx={{ mt: 2, py: 0 }}>Endereço dos fornecedores: <b>{`${f.emailLocal}@${f.dominioEmail || c.dominioPadrao}`}</b></Alert>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Entrada de e-mail (webhook)</Typography>
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>Configure o serviço de e-mail de entrada para fazer <b>POST</b> em <code>{API.replace(/\/api$/, "")}{c.webhookPath}</code> com o cabeçalho <code>Authorization: Bearer &lt;segredo&gt;</code>. Corpo JSON: <code>messageId, from, to, subject, text, html, attachments[{"{filename, contentType, contentBase64}"}]</code>.</Typography>
              <Sub>Segredo atual: {c.tokenConfigurado ? `${c.tokenPrefixo}… (guardado apenas como hash; não pode ser exibido de novo)` : "ainda não gerado (ative a caixa e salve)"} · anexos de até ~1,4 MB cada com o limite padrão do servidor (API_BODY_LIMIT).</Sub>
              {token && <Alert severity="warning" sx={{ mt: 1 }}>Copie agora o segredo — ele não será mostrado de novo: <b style={{ overflowWrap: "anywhere" }}>{token}</b></Alert>}
              {admin && c.tokenConfigurado && <Button size="small" sx={{ mt: 1 }} onClick={rotacionar}>Gerar novo segredo</Button>}
              <Alert severity="info" sx={{ mt: 2, py: 0 }}>A caixa real depende de um provedor de e-mail de entrada (ex.: serviço de “inbound” do seu provedor ou regra de encaminhamento) apontando para o webhook. Até lá, use “Simular recebimento de e-mail”.</Alert>
            </Panel>

            <Panel title="DDA (Débito Direto Autorizado)" subtitle="Consulta dos boletos emitidos contra o CNPJ da instituição.">
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <FormControlLabel sx={{ gridColumn: { md: "1 / -1" } }} control={<Switch checked={!!f.ddaAtivo} disabled={!admin} onChange={(e) => setF({ ...f, ddaAtivo: e.target.checked })} />} label="DDA ativo (sincronização manual e diária)" />
                <TextField select size="small" label="Provedor" value={f.ddaProvedor} disabled={!admin} onChange={set("ddaProvedor")}>
                  {c.provedoresDda.map((p: any) => <MenuItem key={p.nome} value={p.nome}>{p.nome}{p.simulado ? " (simulado)" : ""}</MenuItem>)}
                </TextField>
                <TextField size="small" label="CNPJ da instituição (pagador)" value={f.ddaDocumento} disabled={!admin} onChange={set("ddaDocumento")} />
              </Box>
              <Alert severity="info" sx={{ mt: 2, py: 0 }}>Existe apenas o provedor <b>simulado</b>. Para o DDA real, implemente a interface <code>ProvedorDda</code> (banco ou CIP, com credenciais/certificado da instituição) e registre-a em <code>boletos/provedorDda.ts</code>; depois selecione aqui.</Alert>
            </Panel>

            <Panel title="Parâmetros do check-up">
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <TextField size="small" type="number" label="Vencido há mais de (dias) = alerta" value={f.diasVencidoSuspeito} disabled={!admin} onChange={set("diasVencidoSuspeito")} />
                <TextField size="small" type="number" label="Valor fora do histórico (vezes a mediana)" value={f.fatorValorSuspeito} disabled={!admin} onChange={set("fatorValorSuspeito")} />
                <TextField size="small" type="number" label="Tolerância de vencimento na duplicidade (dias)" value={f.toleranciaDiasDuplicidade} disabled={!admin} onChange={set("toleranciaDiasDuplicidade")} />
                <TextField size="small" type="number" label="Prazo máximo entre nota e vencimento (dias)" value={f.prazoNotaDias} disabled={!admin} onChange={set("prazoNotaDias")} />
                <FormControlLabel control={<Switch checked={!!f.recorrenciaAprendizado} disabled={!admin} onChange={(e) => setF({ ...f, recorrenciaAprendizado: e.target.checked })} />} label="Sugerir recorrências automaticamente" />
              </Box>
              {admin && <Button variant="contained" sx={{ mt: 2 }} onClick={salvar}>Salvar configuração</Button>}
            </Panel>
          </>
        )}
      </Async>
      {toast.node}
    </Box>
  );
}

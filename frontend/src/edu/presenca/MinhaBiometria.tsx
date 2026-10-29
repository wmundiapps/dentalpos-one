import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, TextField, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Async, Panel, Tag, fmtDateTime, useApi, useToast } from "../infraestrutura/kit";
import FaceCamera, { type CapturaFacial } from "./FaceCamera";

function Carteirinha() {
  const cred = useApi<any>("/presenca/biometria/meu/credencial");
  const toast = useToast();
  const [img, setImg] = useState<string | null>(null);
  const qr = cred.data?.qr as string | null | undefined;
  useEffect(() => { if (qr) QRCode.toDataURL(qr, { margin: 1, width: 260 }).then(setImg).catch(() => setImg(null)); else setImg(null); }, [qr]);
  return (
    <Panel title="Carteirinha com QR e código (sem biometria)" subtitle="Alternativa sempre disponível para registrar presença, entrar em espaços e retirar materiais.">
      <Async state={cred}>
        {(c) => (
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
            {c.codigo ? (
              <>
                <Box className="carteirinha-print" sx={{ textAlign: "center" }}>{img && <Box component="img" src={img} alt="QR da carteirinha" sx={{ width: 200, height: 200 }} />}</Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">Código</Typography>
                  <Typography sx={{ fontSize: 32, fontWeight: 900, letterSpacing: 5, fontFamily: "monospace" }}>{c.codigo}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>Mostre o QR à câmera do quiosque ou digite o código. Guarde como senha: se perder, gere outro (o anterior deixa de valer).</Typography>
                </Box>
              </>
            ) : <Typography color="text.secondary">Você ainda não tem carteirinha digital.</Typography>}
            <Box sx={{ display: "grid", gap: 1 }}>
              <Button variant="contained" onClick={() => toast.run(() => eduApi.post("/presenca/biometria/meu/credencial", {}), "Nova carteirinha gerada.", () => cred.reload(), c.codigo ? "Gerar um novo QR/código? O atual deixará de funcionar." : undefined)}>{c.codigo ? "Gerar novo QR/código" : "Gerar minha carteirinha"}</Button>
              {c.codigo && <Button startIcon={<PrintIcon />} onClick={() => window.print()}>Imprimir</Button>}
            </Box>
          </Box>
        )}
      </Async>
      {toast.node}
    </Panel>
  );
}

/** Portal: consentimento, cadastro e revogação da biometria facial + carteirinha alternativa. */
export default function MinhaBiometria() {
  const st = useApi<any>("/presenca/biometria/meu");
  const termo = useApi<any>("/presenca/biometria/termo");
  const toast = useToast();
  const [aceito, setAceito] = useState(false);
  const [precisaResp, setPrecisaResp] = useState(false);
  const [resp, setResp] = useState({ nome: "", parentesco: "", email: "", telefone: "", declaracao: false });
  const [refazendo, setRefazendo] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  const t = termo.data;

  async function consentir() {
    const body: any = { versao: t.termo.versao };
    if (precisaResp) body.responsavel = { nome: resp.nome, parentesco: resp.parentesco, email: resp.email || undefined, telefone: resp.telefone || undefined, declaracao: resp.declaracao };
    try { await eduApi.post("/presenca/biometria/meu/consentimento", body); toast.ok("Consentimento registrado. Agora cadastre seu rosto."); st.reload(); }
    catch (e: any) { if (/menor de 18/i.test(e.message)) setPrecisaResp(true); toast.err(e.message); }
  }
  async function cadastrar(c: CapturaFacial) {
    try { await eduApi.post("/presenca/biometria/meu/cadastro", { embeddings: c.embeddings, liveness: c.liveness, qualidade: c.qualidade, modelo: c.modelo }); setFeito("Rosto cadastrado com sucesso. Seus dados ficam só como um vetor criptografado; nenhuma foto foi guardada."); setRefazendo(false); st.reload(); }
    catch (e: any) { toast.err(e.message); throw e; }
  }
  async function revogar() {
    if (!window.confirm("Revogar o consentimento e excluir agora o seu cadastro facial? Você continuará registrando presença pelo QR/código.")) return;
    try { await eduApi.del(`/presenca/biometria/meu?motivo=${encodeURIComponent("Revogação pelo titular no portal")}`); setFeito("Consentimento revogado e cadastro facial excluído."); setPrecisaResp(false); setAceito(false); st.reload(); } catch (e: any) { toast.err(e.message); }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="info">
        <b>Reconhecimento facial é opcional.</b> Você pode registrar presença e acesso apenas com a carteirinha (QR/código) ou pela lista manual, sem nenhum prejuízo. Se optar pelo rosto, só um vetor numérico criptografado é guardado — <b>nenhuma foto ou vídeo</b>.
      </Alert>
      {feito && <Alert severity="success" onClose={() => setFeito(null)}>{feito}</Alert>}
      <Async state={st}>
        {(d) => (
          <Panel title="Meu cadastro facial" subtitle="Dado biométrico é dado pessoal sensível (LGPD, art. 5º, II): só é tratado com o seu consentimento específico.">
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Tag text={d.consentimento ? "Consentimento ativo" : "Sem consentimento"} tone={d.consentimento ? "success" : "default"} />
              <Tag text={d.biometriaCadastrada ? `Rosto cadastrado (${d.amostras} amostras)` : "Rosto não cadastrado"} tone={d.biometriaCadastrada ? "success" : "default"} />
              {d.cadastradoEm && <Chip size="small" label={`Cadastrado em ${fmtDateTime(d.cadastradoEm)}`} />}
              {d.ultimoUsoEm && <Chip size="small" label={`Último uso ${fmtDateTime(d.ultimoUsoEm)}`} />}
              {d.revogadoEm && <Chip size="small" color="warning" label={`Revogado em ${fmtDateTime(d.revogadoEm)}`} />}
            </Box>

            {!d.consentimento && (
              <Box sx={{ display: "grid", gap: 1.5 }}>
                <Async state={termo}>
                  {(tt) => (
                    <>
                      <Box sx={{ display: "grid", gap: 0.5, bgcolor: "action.hover", p: 2, borderRadius: 3 }}>
                        {Object.entries(tt.aviso).map(([k, v]) => <Typography key={k} variant="body2"><b>{({ finalidade: "Para quê", oQueGuardamos: "O que guardamos", baseLegal: "Base legal", alternativa: "Alternativa", revogacao: "Revogação", retencao: "Retenção", compartilhamento: "Compartilhamento" } as any)[k] || k}:</b> {String(v)}</Typography>)}
                      </Box>
                      <Box sx={{ maxHeight: 180, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{tt.termo.titulo} · versão {tt.termo.versao}</Typography>
                        <Typography variant="body2">{tt.termo.texto}</Typography>
                      </Box>
                    </>
                  )}
                </Async>
                {precisaResp && (
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
                    <Alert severity="warning" sx={{ gridColumn: "1 / -1" }}>Menor de 18 anos: o consentimento precisa ser dado pelo pai, mãe ou responsável legal (LGPD, art. 14, §1º).</Alert>
                    <TextField size="small" label="Nome do responsável" value={resp.nome} onChange={(e) => setResp({ ...resp, nome: e.target.value })} />
                    <TextField size="small" label="Parentesco" value={resp.parentesco} onChange={(e) => setResp({ ...resp, parentesco: e.target.value })} />
                    <TextField size="small" label="E-mail" value={resp.email} onChange={(e) => setResp({ ...resp, email: e.target.value })} />
                    <TextField size="small" label="Telefone" value={resp.telefone} onChange={(e) => setResp({ ...resp, telefone: e.target.value })} />
                    <FormControlLabel sx={{ gridColumn: "1 / -1" }} control={<Checkbox checked={resp.declaracao} onChange={(e) => setResp({ ...resp, declaracao: e.target.checked })} />} label="Declaro que sou o responsável legal e autorizo o uso do reconhecimento facial." />
                  </Box>
                )}
                <FormControlLabel control={<Checkbox checked={aceito} onChange={(e) => setAceito(e.target.checked)} />} label="Li o aviso acima e CONSINTO, de forma específica, com o uso do meu rosto (vetor criptografado) para registrar presença e acesso." />
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button variant="contained" disabled={!aceito || !t?.termo} onClick={consentir}>Dar consentimento</Button>
                  <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>Prefere não usar o rosto? Basta ignorar: use a carteirinha abaixo.</Typography>
                </Box>
              </Box>
            )}

            {d.consentimento && (!d.biometriaCadastrada || refazendo) && (
              <Box sx={{ display: "grid", gap: 1.5, maxWidth: 560 }}>
                <Typography variant="body2">Fique em local iluminado, sem óculos escuros ou boné. Vamos pedir para <b>piscar</b> ou <b>virar a cabeça</b> para confirmar que é você, e depois capturar 3 amostras. A imagem é processada <b>somente neste aparelho</b>.</Typography>
                <FaceCamera modo="cadastrar" amostras={3} onCaptura={cadastrar} />
                {refazendo && <Button onClick={() => setRefazendo(false)}>Cancelar</Button>}
              </Box>
            )}

            {d.consentimento && d.biometriaCadastrada && !refazendo && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="outlined" onClick={() => setRefazendo(true)}>Refazer cadastro do rosto</Button>
                <Button color="error" variant="outlined" onClick={revogar}>Revogar consentimento e excluir meu rosto</Button>
              </Box>
            )}
            {d.consentimento && !d.biometriaCadastrada && !refazendo && <Box sx={{ mt: 1 }}><Button color="error" size="small" onClick={revogar}>Revogar consentimento</Button></Box>}
          </Panel>
        )}
      </Async>
      <Carteirinha />
      {toast.node}
    </Box>
  );
}

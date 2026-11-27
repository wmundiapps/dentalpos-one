import { Alert, Box, Button, Chip, Typography } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SendIcon from "@mui/icons-material/Send";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { BASE, ROTULO_CANAL, Section, Stat, StateBox, useLoad, type Toast } from "./common";

/** Semáforo de SLA: verde / amarelo / vermelho. */
function Semaforo({ sla }: { sla: { OK: number; ATENCAO: number; ESTOURADO: number } }) {
  const itens = [["OK", "No prazo", "#2e7d32"], ["ATENCAO", "Vencendo", "#ed6c02"], ["ESTOURADO", "Estourado", "#d32f2f"]] as const;
  return (
    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {itens.map(([k, l, c]) => (
        <Box key={k} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: c, opacity: sla[k] ? 1 : 0.25 }} />
          <Typography><b>{sla[k]}</b> {l}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function PainelTab({ toast }: { toast: (t: Toast) => void }) {
  const painel = useLoad<any>(`${BASE}/painel`);
  const metr = useLoad<any>(`${BASE}/conversas/metricas`);
  const resumo = useLoad<any[]>(`${BASE}/outbox/resumo`);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<any>, ok: (r: any) => string) {
    setBusy(true);
    try { const r = await fn(); toast({ type: "success", text: ok(r) }); painel.reload(); resumo.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  const p = painel.data;
  const m = metr.data;
  const porStatus = (resumo.data || []).reduce((a: Record<string, number>, x) => ({ ...a, [x.status]: (a[x.status] || 0) + x.total }), {});

  return (
    <>
      <Section title="Visão geral" description="Canais, caixa de saída e atendimento dos últimos 7 dias."
        actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} disabled={busy}
            onClick={() => run(() => eduApi.post(`${BASE}/bootstrap`), (r) => `Dados padrão prontos (${r.templates ?? 0} templates, ${r.faqs ?? 0} FAQs, ${r.fluxos ?? 0} fluxos, ${r.reguas ?? 0} réguas criados).`)}>Preparar dados padrão</Button>
          <Button size="small" variant="contained" startIcon={<SendIcon />} disabled={busy}
            onClick={() => run(() => eduApi.post(`${BASE}/despacho/executar`, {}), (r) => `Despacho executado${r?.enviadas != null ? `: ${r.enviadas} enviada(s), ${r.falhas ?? 0} falha(s)` : ""}.`)}>Despachar pendentes agora</Button>
        </Box>}>
        <StateBox loading={painel.loading} error={painel.error} onRetry={painel.reload}>
          {p ? (
            <>
              {p.canaisNaoConfigurados > 0 ? <Alert severity="warning" sx={{ mb: 2 }}>{p.canaisNaoConfigurados} canal(is) sem credenciais: as mensagens por eles ficam como falha explicativa. Configure na aba Canais e envios.</Alert> : null}
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Stat label="Conversas abertas" value={p.conversasAbertas} />
                <Stat label="Mensagens pendentes" value={p.caixaDeSaida?.pendentes} />
                <Stat label="Enviadas (7 dias)" value={p.caixaDeSaida?.enviadas7d} color="#2e7d32" />
                <Stat label="Falhas (7 dias)" value={p.caixaDeSaida?.falhas7d} color={p.caixaDeSaida?.falhas7d ? "#d32f2f" : undefined} />
                <Stat label="Campanhas ativas" value={p.campanhasAtivas} />
                <Stat label="Posts p/ aprovação" value={p.postsAguardandoAprovacao} />
                <Stat label="Chamadas (7 dias)" value={p.chamadas7d} />
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 3, mb: 1 }}>Canais</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {(p.canais || []).length === 0 ? <Typography variant="body2" color="text.secondary">Nenhum canal cadastrado.</Typography> : null}
                {(p.canais || []).map((c: any) => (
                  <Chip key={c.id} label={`${ROTULO_CANAL[c.tipo] || c.tipo}: ${c.nome}`} color={!c.ativo ? "default" : !c.configurado ? "warning" : c.ultimoTesteOk === false ? "error" : "success"} variant={c.configurado ? "filled" : "outlined"} />
                ))}
              </Box>
            </>
          ) : null}
        </StateBox>
      </Section>

      <Section title="Atendimento e SLA" description="Semáforo das conversas abertas e tempo de primeira resposta.">
        <StateBox loading={metr.loading} error={metr.error} onRetry={metr.reload}>
          {m ? (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Semaforo sla={m.sla} />
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Stat label="Abertas" value={m.abertas} />
                <Stat label="Na fila (sem atendente)" value={m.naFila} color={m.naFila ? "#ed6c02" : undefined} />
                <Stat label="Tempo médio 1ª resposta" value={m.tempoMedioPrimeiraRespostaMin != null ? `${m.tempoMedioPrimeiraRespostaMin} min` : "—"} hint="últimos 30 dias" />
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {Object.entries(m.porCanal || {}).map(([k, v]) => <Chip key={k} variant="outlined" label={`${ROTULO_CANAL[k] || k}: ${v}`} />)}
              </Box>
            </Box>
          ) : null}
        </StateBox>
      </Section>

      <Section title="Caixa de saída (30 dias)" description="Situação das mensagens enviadas por todos os módulos.">
        <StateBox loading={resumo.loading} error={resumo.error} onRetry={resumo.reload} empty={!resumo.data?.length} emptyText="Nenhuma mensagem nos últimos 30 dias.">
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {Object.entries(porStatus).map(([k, v]) => <Chip key={k} color={/FALHA|CANCEL/.test(k) ? "error" : /PENDENTE/.test(k) ? "warning" : "success"} label={`${k}: ${v}`} />)}
          </Box>
        </StateBox>
      </Section>
    </>
  );
}

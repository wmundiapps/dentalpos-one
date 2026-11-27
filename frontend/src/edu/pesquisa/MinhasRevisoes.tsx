import { Alert, Box, Button, Chip, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, LoadBox, Section, Status, call, fmtDate, itemsOf, useApi, useToast } from "../desempenho/kit";

const CRITERIOS = [["originalidade", "Originalidade"], ["metodologia", "Metodologia"], ["relevancia", "Relevância"], ["clareza", "Clareza"], ["referencias", "Referências"]];

export default function MinhasRevisoes() {
  const [rev, setRev] = useState(0);
  const [par, setPar] = useState<any | null>(null);
  const { toast, node } = useToast();
  const l = useApi<any>("/pesquisa/minhas-revisoes", [rev]);
  const rows = itemsOf(l.data);
  async function responder(id: string, aceitar: boolean) {
    const motivo = aceitar ? undefined : window.prompt("Motivo da recusa (opcional):") ?? undefined;
    try { await call("POST", `/pesquisa/revisoes/${id}/responder`, { aceitar, motivo }); toast({ type: "success", text: aceitar ? "Convite aceito." : "Convite recusado." }); setRev((x) => x + 1); }
    catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Meus pareceres (revisão por pares, duplo-cego)">
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Você vê apenas o manuscrito anonimizado. Declare ausência de conflito de interesse ao enviar o parecer.</Alert>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Você não tem convites de revisão." onRetry={l.reload}>
        {rows.map((r) => {
          const s = r.submissao || {};
          return (
            <Box key={r.id} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, mb: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{s.titulo ?? s.codigo ?? "Manuscrito"}</Typography>
                <Status value={r.status} /><Chip size="small" label={`Rodada ${r.rodada}`} /><Chip size="small" variant="outlined" label={`Prazo ${fmtDate(r.prazo)}`} />
              </Box>
              {s.resumo && <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{s.resumo}</Typography>}
              {s.arquivoUrl && <Typography variant="caption" component="div">Manuscrito: {s.arquivoUrl}</Typography>}
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                {r.status === "CONVIDADO" && <><Button size="small" variant="contained" onClick={() => responder(r.id, true)}>Aceitar</Button><Button size="small" color="warning" onClick={() => responder(r.id, false)}>Recusar</Button></>}
                {r.status === "ACEITO" && <Button size="small" variant="contained" onClick={() => setPar(r)}>Enviar parecer</Button>}
                {r.status === "CONCLUIDO" && <Chip size="small" color="success" label={`Parecer enviado: ${String(r.recomendacao ?? "").replace(/_/g, " ")}`} />}
              </Box>
            </Box>
          );
        })}
      </LoadBox>
      <FormDialog open={!!par} onClose={() => setPar(null)} title="Parecer" submitLabel="Enviar parecer" initial={{ semConflito: false }}
        fields={[
          { key: "recomendacao", label: "Recomendação", type: "select", options: ["ACEITAR", "REVISOES_MENORES", "REVISOES_MAIORES", "REJEITAR"], required: true },
          ...CRITERIOS.map(([k, l]) => ({ key: `n_${k}`, label: `${l} (1 a 5)`, type: "number" as const, required: true })),
          { key: "comentarioAutor", label: "Comentários ao autor (mín. 20 caracteres)", type: "textarea", required: true }, { key: "comentarioEditor", label: "Comentários confidenciais ao editor", type: "textarea" },
          { key: "semConflito", label: "Declaro não ter conflito de interesse com este manuscrito", type: "bool" },
        ]}
        onSubmit={async (b, raw) => {
          const notas: Record<string, number> = {};
          CRITERIOS.forEach(([k]) => { notas[k] = Number(raw[`n_${k}`]); });
          await call("POST", `/pesquisa/revisoes/${par.id}/parecer`, { recomendacao: b.recomendacao, notas, comentarioAutor: b.comentarioAutor, comentarioEditor: b.comentarioEditor, semConflito: raw.semConflito ? true : false });
          toast({ type: "success", text: "Parecer enviado. Obrigado!" }); setRev((x) => x + 1);
        }} />
    </Section>
  );
}

import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Typography } from "@mui/material";
import { useState } from "react";
import { Estado, Formulario, Lista, SOC, Secao, StatusChip, dataBr, host, qstr, rotulo, useApi, useRun, useToast, Kpi, KpiRow } from "../comum2/kit";

const TIPOS = ["FUNCIONAMENTO", "BOMBEIROS", "VIGILANCIA_SANITARIA", "AMBIENTAL", "OUTRO"];

/** Lista de alvarás (de uma abertura ou de todas as empresas), com alerta de renovação. */
export default function AlvarasLista({ aberturaId, empresaId, apenasAlertas, recarga }: { aberturaId?: string; empresaId?: string; apenasAlertas?: boolean; recarga?: unknown }) {
  const r = useApi<any>(`${SOC}/alvaras?${qstr({ pageSize: 100, aberturaId, empresaId, alerta: apenasAlertas ? "true" : "" })}`, [recarga]);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [edit, setEdit] = useState<any | null>(null);
  const [novo, setNovo] = useState(false);
  const [check, setCheck] = useState<any | null>(null);
  const items: any[] = r.data?.items || [];
  const campos = [
    { nome: "tipo", rotulo: "Tipo", tipo: "select" as const, obrigatorio: true, opcoes: TIPOS.map((t) => ({ value: t, label: rotulo(t) })) },
    { nome: "descricao", rotulo: "Descrição" }, { nome: "numero", rotulo: "Número do alvará" },
    { nome: "emissao", rotulo: "Emissão", tipo: "date" as const }, { nome: "validade", rotulo: "Validade", tipo: "date" as const },
    { nome: "status", rotulo: "Situação", tipo: "select" as const, opcoes: ["PENDENTE", "EM_ANALISE", "VIGENTE", "DISPENSADO"].map((t) => ({ value: t, label: rotulo(t) })), padrao: "PENDENTE" },
    { nome: "alertaDias", rotulo: "Alertar quantos dias antes do vencimento", tipo: "number" as const, padrao: 60 },
    { nome: "observacao", rotulo: "Observação", tipo: "textarea" as const },
  ];
  return (
    <Box>
      {node}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}><Button size="small" variant="outlined" onClick={() => setNovo(true)}>Cadastrar alvará</Button></Box>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio={apenasAlertas ? "Nenhum alvará vencido ou a vencer." : "Nenhum alvará cadastrado."}>
        <Lista linhas={items} colunas={[
          { titulo: "Alvará", principal: true, render: (a: any) => <>{rotulo(a.tipo)}{a.empresaNome ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{a.empresaNome}</Typography> : null}</> },
          { titulo: "Número", render: (a: any) => a.numero || "—" }, { titulo: "Validade", render: (a: any) => dataBr(a.validade) },
          { titulo: "Renovação", render: (a: any) => (a.diasParaVencer == null ? "—" : a.diasParaVencer < 0 ? <Chip size="small" color="error" label={`vencido há ${-a.diasParaVencer} d`} /> : <Chip size="small" color={a.alerta ? "warning" : "success"} label={`${a.diasParaVencer} d`} />) },
          { titulo: "Situação", render: (a: any) => <StatusChip v={a.situacao} /> },
        ]} acoes={(a: any) => (<><Button size="small" onClick={() => setCheck(a)}>Checklist</Button><Button size="small" onClick={() => setEdit(a)}>Editar</Button><Button size="small" color="error" onClick={() => run(() => host.del(`${SOC}/alvaras/${a.id}`), "Alvará removido.", "Remover este alvará?")}>Remover</Button></>)} />
      </Estado>
      <Formulario aberto={novo} titulo="Cadastrar alvará" campos={[...campos, ...(aberturaId ? [] : [{ nome: "empresaId", rotulo: "Código da empresa (empresaId)", obrigatorio: true }, { nome: "empresaNome", rotulo: "Nome da empresa" }])]} aoFechar={() => setNovo(false)}
        aoEnviar={async (v) => { const ok = await run(() => host.post(`${SOC}/alvaras`, { ...v, aberturaId, empresaId: empresaId || v.empresaId }), "Alvará cadastrado."); if (ok) setNovo(false); }} />
      <Formulario aberto={!!edit} titulo="Editar alvará" campos={campos} inicial={edit ? { ...edit, emissao: edit.emissao?.slice(0, 10), validade: edit.validade?.slice(0, 10) } : undefined} aoFechar={() => setEdit(null)}
        aoEnviar={async (v) => { const ok = await run(() => host.put(`${SOC}/alvaras/${edit.id}`, v), "Alvará atualizado."); if (ok) setEdit(null); }} />
      {check ? <ChecklistAlvara alvara={check} onClose={() => setCheck(null)} onSaved={r.reload} /> : null}
    </Box>
  );
}

function ChecklistAlvara({ alvara, onClose, onSaved }: { alvara: any; onClose: () => void; onSaved: () => void }) {
  const [itens, setItens] = useState<Array<{ item: string; ok: boolean }>>(alvara.checklist || []);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Box sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,.4)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }} onClick={onClose}>
      <Box onClick={(e) => e.stopPropagation()} sx={{ bgcolor: "background.paper", borderRadius: 3, p: 2.5, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Checklist — {rotulo(alvara.tipo)}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{alvara.descricao}</Typography>
        {itens.length ? itens.map((c, i) => <FormControlLabel key={i} sx={{ display: "flex" }} control={<Checkbox checked={c.ok} onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, ok: e.target.checked } : x)))} />} label={c.item} />) : <Typography color="text.secondary">Sem itens. Gere o checklist por atividade na abertura.</Typography>}
        {msg ? <Alert severity="error" sx={{ mt: 1 }}>{msg}</Alert> : null}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={async () => { try { await host.put(`${SOC}/alvaras/${alvara.id}`, { checklist: itens }); onSaved(); onClose(); } catch (e: any) { setMsg(e.message); } }}>Salvar</Button></Box>
      </Box>
    </Box>
  );
}

export function PainelSocietario() {
  const p = useApi<any>(`${SOC}/painel`);
  const d = p.data;
  return (
    <Box>
      <Estado loading={p.loading} error={p.error} onRetry={p.reload}>
        {d ? (
          <>
            <KpiRow>
              <Kpi titulo="Aberturas em andamento" valor={d.aberturas?.EM_ANDAMENTO ?? 0} cor="#0F5FDB" />
              <Kpi titulo="Concluídas" valor={d.aberturas?.CONCLUIDA ?? 0} cor="#2e9e5b" />
              <Kpi titulo="Protocolos abertos (simulados)" valor={d.protocolosAbertos} />
              <Kpi titulo="Tarefas atrasadas" valor={d.tarefasAtrasadas} cor={d.tarefasAtrasadas ? "#d64545" : undefined} />
              <Kpi titulo="Alvarás vencidos" valor={d.alvaras.vencidos} cor={d.alvaras.vencidos ? "#d64545" : "#2e9e5b"} />
              <Kpi titulo="Alvarás a vencer" valor={d.alvaras.aVencer} cor={d.alvaras.aVencer ? "#c98a00" : "#2e9e5b"} />
            </KpiRow>
            <Secao titulo="Alvarás vencidos ou a vencer"><AlvarasLista apenasAlertas recarga={d.alvaras.total} /></Secao>
          </>
        ) : null}
      </Estado>
    </Box>
  );
}

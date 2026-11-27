import { Box, Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "./ListTable";
import { Async, FormDialog, Panel, SubNav, Tag, fmtDate, itemsOf, label, useApi, useOptions, useSpaces, useToast } from "./kit";
import { abrirArquivo, useDepartamentos, usePessoas } from "./cppKit";

function MeusBens({ onChanged }: { onChanged: () => void }) {
  const st = useApi<any>("/infraestrutura/meus-bens");
  const toast = useToast();
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          {d.transferenciasParaAceitar.length > 0 && (
            <Panel title="Transferências para você aceitar">
              {d.transferenciasParaAceitar.map((t: any) => (
                <Box key={t.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
                  <b>{t.numero}</b><span>{t.motivo}</span>
                  <Button size="small" variant="contained" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/transferencias/${t.id}/aceitar`, { confirmo: true }), "Transferência aceita: o bem agora está sob a sua responsabilidade.", () => { st.reload(); onChanged(); }, "Declaro que recebi o bem e assumo a responsabilidade por sua guarda. Confirmar?")}>Aceitar</Button>
                  <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo da recusa:"); if (m) toast.run(() => eduApi.post(`/infraestrutura/transferencias/${t.id}/recusar`, { motivo: m }), "Recusada.", () => { st.reload(); onChanged(); }); }}>Recusar</Button>
                </Box>
              ))}
            </Panel>
          )}
          {d.termosPendentes.length > 0 && (
            <Panel title="Termos de responsabilidade pendentes">
              {d.termosPendentes.map((t: any) => (
                <Box key={t.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
                  <b>{t.numero}</b>
                  <Button size="small" onClick={() => toast.run(() => abrirArquivo("GET", `/infraestrutura/termos/${t.id}/documento`), "Termo aberto.")}>Ler termo</Button>
                  <Button size="small" variant="contained" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/termos/${t.id}/aceitar`, { confirmo: true }), "Termo aceito.", () => { st.reload(); onChanged(); }, "Li e aceito o termo de responsabilidade deste bem. Confirmar?")}>Aceitar</Button>
                  <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo da recusa:"); if (m) toast.run(() => eduApi.post(`/infraestrutura/termos/${t.id}/recusar`, { motivo: m }), "Recusado.", st.reload); }}>Recusar</Button>
                </Box>
              ))}
            </Panel>
          )}
          <Panel title={`Bens sob a sua responsabilidade (${d.bens.length})`}>
            {d.bens.map((b: any) => (
              <Box key={b.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
                <b>{b.tombamento}</b><span>{b.descricao}</span>{b.termo ? <Tag text={`Termo ${label(b.termo.status)}`} tone={b.termo.status === "VIGENTE" ? "success" : "warning"} /> : <Tag text="Sem termo" tone="error" />}
              </Box>
            ))}
            {!d.bens.length && <Typography color="text.secondary">Nenhum bem em seu nome.</Typography>}
          </Panel>
          {toast.node}
        </Box>
      )}
    </Async>
  );
}

function RelatorioResp() {
  const st = useApi<any>("/infraestrutura/relatorios/responsabilidade");
  const toast = useToast();
  return (
    <Async state={st}>
      {(d) => (
        <Panel title="Responsabilidade do patrimônio" actions={<Button onClick={() => toast.run(() => abrirArquivo("GET", "/infraestrutura/relatorios/responsabilidade?format=html"), "Relatório aberto.")}>Imprimir</Button>}>
          <Typography>Bens ativos {d.bensAtivos} · sem responsável {d.semResponsavel} · sem departamento {d.semDepartamento} · sem termo vigente {d.semTermoVigente} · termos pendentes {d.termosPendentesAceite} · transferências aguardando aceite {d.transferenciasAguardandoAceite}</Typography>
          {toast.node}
        </Panel>
      )}
    </Async>
  );
}

export default function TransferenciasTab() {
  const [sub, setSub] = useState("transferencias");
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const spaces = useSpaces();
  const deps = useDepartamentos();
  const pessoas = usePessoas();
  const bensOpts = useOptions(`cpp-bens-${key}`, async () => itemsOf(await eduApi.get("/infraestrutura/bens?pageSize=200&status=ATIVO")).map((b: any) => ({ value: b.id, label: `${b.tombamento} — ${b.descricao}` })));
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const tom = (s: string) => (s === "CONCLUIDA" ? "success" : s === "AGUARDANDO_ACEITE" ? "warning" : "error") as any;

  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "transferencias", label: "Transferências" }, { key: "termos", label: "Termos de responsabilidade" }, { key: "meus", label: "Meus bens e aceites" }, { key: "relatorio", label: "Responsabilidade" }]} />
      {sub === "transferencias" && (
        <ListTable path="/infraestrutura/transferencias" refreshKey={key} searchable={false}
          filters={[{ key: "status", label: "Situação", options: ["AGUARDANDO_ACEITE", "CONCLUIDA", "RECUSADA", "CANCELADA", "EXPIRADA"] }]}
          toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Nova transferência</Button>}
          columns={[
            { key: "numero", label: "Número" }, { key: "bem", label: "Bem", render: (r) => r.bem ? `${r.bem.tombamento} — ${r.bem.descricao}` : "—" },
            { key: "origem", label: "De", render: (r) => [r.origem?.local, r.origem?.departamento, r.origem?.responsavel].filter(Boolean).join(" · ") || "—" },
            { key: "destino", label: "Para", render: (r) => [r.destino?.local, r.destino?.departamento, r.destino?.responsavel].filter(Boolean).join(" · ") || "—" },
            { key: "motivo", label: "Motivo" }, { key: "status", label: "Situação", render: (r) => <Tag text={label(r.status)} tone={tom(r.status)} /> },
            { key: "createdAt", label: "Pedido em", render: (r) => fmtDate(r.createdAt) },
          ]}
          actions={(r, rl) => r.status === "AGUARDANDO_ACEITE" ? <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/transferencias/${r.id}/cancelar`, {}), "Cancelada.", rl, "Cancelar a transferência?")}>Cancelar</Button> : null} />
      )}
      {sub === "termos" && (
        <ListTable path="/infraestrutura/termos" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["PENDENTE_ACEITE", "VIGENTE", "RECUSADO", "ENCERRADO", "CANCELADO"] }]}
          columns={[
            { key: "numero", label: "Termo" }, { key: "bem", label: "Bem", render: (r) => r.bem ? `${r.bem.tombamento} — ${r.bem.descricao}` : "—" }, { key: "responsavel", label: "Responsável" },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }, { key: "aceitoEm", label: "Aceite", render: (r) => fmtDate(r.aceitoEm) },
            { key: "desatualizado", label: "", render: (r) => r.desatualizado ? <Tag text="Responsável mudou" tone="warning" /> : null },
          ]}
          actions={(r) => <Button size="small" onClick={() => toast.run(() => abrirArquivo("GET", `/infraestrutura/termos/${r.id}/documento`), "Termo aberto para impressão.")}>Imprimir</Button>} />
      )}
      {sub === "meus" && <MeusBens onChanged={reload} />}
      {sub === "relatorio" && <RelatorioResp />}
      <FormDialog open={novo} title="Nova transferência" submitLabel="Solicitar" onClose={() => setNovo(false)}
        intro={<Typography variant="body2" sx={{ mb: 2 }}>Se houver novo responsável, ele precisa aceitar para a transferência valer. O histórico e o termo de responsabilidade são atualizados no aceite.</Typography>}
        fields={[
          { key: "bemId", label: "Bem", type: "select", options: bensOpts, required: true, full: true },
          { key: "destinoSpaceId", label: "Novo local", type: "select", options: spaces }, { key: "destinoDepartamentoId", label: "Novo departamento", type: "select", options: deps },
          { key: "destinoResponsavelId", label: "Novo responsável", type: "select", options: pessoas }, { key: "documento", label: "Documento (ofício/memorando)" },
          { key: "motivo", label: "Motivo", required: true, type: "textarea" },
        ]}
        onSubmit={async (b) => { const r: any = await eduApi.post("/infraestrutura/transferencias", b); toast.ok(r.exigeAceite ? "Solicitada: aguardando o aceite do novo responsável." : "Transferência concluída."); reload(); }} />
      {toast.node}
    </Box>
  );
}

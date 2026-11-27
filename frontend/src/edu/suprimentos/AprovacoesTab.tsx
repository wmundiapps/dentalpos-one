import { Box, Button, Typography } from "@mui/material";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Light, Panel, SubNav, Tag, brl, fmtDate, label, useApi, useToast } from "../infraestrutura/kit";
import { abrirArquivo } from "../infraestrutura/cppKit";

export const FORMAS = ["A_VISTA", "PARCELADO", "BOLETO", "PIX", "CARTAO", "PRAZO"];

function ContasRascunho({ compra, onClose, onChanged }: { compra: any; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/suprimentos/compras/${compra.id}/contas-pagar`);
  const toast = useToast();
  return (
    <Panel title={`Contas a pagar — ${compra.numero}`} subtitle="Lançadas automaticamente na aprovação como RASCUNHO. O Financeiro confere antes de liberar para pagamento."
      actions={<><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={() => toast.run(() => eduApi.post(`/suprimentos/compras/${compra.id}/contas-pagar/conferir`, {}), "Parcelas conferidas e liberadas.", () => { st.reload(); onChanged(); }, "Conferir todas as parcelas em rascunho?")}>Conferir todas</Button></>}>
      <Async state={st}>
        {(d) => (
          <Box sx={{ overflowX: "auto" }}>
            {d.contas.map((c: any) => (
              <Box key={c.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
                <b>{c.parcela}/{c.totalParcelas}</b><span>{brl(c.valor)}</span><span>vence {fmtDate(c.vencimento)}</span>
                <Tag text={label(c.situacao)} tone={c.situacao === "CONFERIDA" ? "success" : c.situacao === "RASCUNHO" ? "warning" : "default"} />{c.divergencia && <Tag text="Divergência" tone="error" />}
                <Typography variant="caption" color="text.secondary">{c.accountPayable?.descricao}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Async>
      {toast.node}
    </Panel>
  );
}

export default function AprovacoesTab() {
  const [sub, setSub] = useState("compras");
  const [key, setKey] = useState(0);
  const [contas, setContas] = useState<any | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const decidir = (path: string, valor: string, rl: () => void) => {
    const parecer = window.prompt("Parecer (obrigatório para reprovar):") ?? "";
    const rep = valor.startsWith("REPROV");
    if (rep && !parecer.trim()) return;
    toast.run(() => eduApi.post(path, { decisao: valor, parecer: parecer || undefined }), rep ? "Reprovado." : "Aprovado.", () => { rl(); reload(); });
  };
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "compras", label: "Compras (valor e pagamento)" }, { key: "excecoes", label: "Exceções de cotação" }]} />
      {sub === "compras" && (
        <>
          <ListTable path="/suprimentos/compras" refreshKey={key} searchable={false}
            filters={[{ key: "status", label: "Situação", options: ["AGUARDANDO_APROVACAO", "APROVADA", "REPROVADA", "CANCELADA"] }, { key: "formaPagamento", label: "Pagamento", options: FORMAS }]}
            columns={[
              { key: "numero", label: "Compra" }, { key: "fornecedor", label: "Fornecedor" }, { key: "valorTotal", label: "Valor", align: "right", render: (r) => brl(r.valorTotal) },
              { key: "formaPagamento", label: "Pagamento", render: (r) => `${label(r.formaPagamento)}${r.parcelas > 1 ? ` ${r.parcelas}x` : ""}` },
              { key: "niveis", label: "Alçada", render: (r) => <Box sx={{ display: "grid", gap: 0.25 }}>{(r.niveis || []).map((n: any) => <Light key={n.id} tone={n.status === "APROVADO" ? "success" : n.status === "REPROVADO" ? "error" : "warning"} text={`${n.nivel}. ${n.papel}${n.motivoNivel === "FORMA_PAGAMENTO" ? " (forma)" : ""}`} />)}</Box> },
              { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
              { key: "contas", label: "Contas a pagar", render: (r) => (r.contas || []).filter((c: any) => c.situacao !== "CANCELADA").length ? `${(r.contas || []).filter((c: any) => c.situacao === "RASCUNHO").length} rascunho(s)` : "—" },
            ]}
            actions={(r, rl) => (
              <>
                {r.status === "AGUARDANDO_APROVACAO" && <Button size="small" variant="contained" color="success" onClick={() => decidir(`/suprimentos/compras/${r.id}/decidir`, "APROVADO", rl)}>Aprovar</Button>}
                {r.status === "AGUARDANDO_APROVACAO" && <Button size="small" color="error" onClick={() => decidir(`/suprimentos/compras/${r.id}/decidir`, "REPROVADO", rl)}>Reprovar</Button>}
                {r.status === "APROVADA" && <Button size="small" onClick={() => setContas(r)}>Contas a pagar</Button>}
                {r.status === "APROVADA" && !(r.contas || []).some((c: any) => c.situacao !== "CANCELADA") && <Button size="small" onClick={() => toast.run(() => eduApi.post(`/suprimentos/compras/${r.id}/gerar-conta-pagar`, {}), "Conta a pagar lançada em rascunho.", rl)}>Gerar conta a pagar</Button>}
                <Button size="small" onClick={() => toast.run(() => abrirArquivo("GET", `/suprimentos/cotacoes/${r.cotacaoId}/mapa-comparativo?format=html`), "Mapa aberto.")}>Mapa</Button>
              </>
            )} />
          {contas && <Box sx={{ mt: 2 }}><ContasRascunho compra={contas} onClose={() => setContas(null)} onChanged={reload} /></Box>}
        </>
      )}
      {sub === "excecoes" && (
        <ListTable path="/suprimentos/excecoes-cotacao" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["SOLICITADA", "APROVADA", "REPROVADA", "CANCELADA"] }]}
          columns={[
            { key: "numero", label: "Exceção" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "motivo", label: "Motivo", render: (r) => label(r.motivo) },
            { key: "justificativa", label: "Justificativa" }, { key: "valorEstimado", label: "Valor", align: "right", render: (r) => brl(r.valorEstimado) },
            { key: "papelAprovador", label: "Aprovador" }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          actions={(r, rl) => r.status === "SOLICITADA" ? (
            <>
              <Button size="small" variant="contained" color="success" onClick={() => decidir(`/suprimentos/excecoes-cotacao/${r.id}/decidir`, "APROVADA", rl)}>Aprovar</Button>
              <Button size="small" color="error" onClick={() => decidir(`/suprimentos/excecoes-cotacao/${r.id}/decidir`, "REPROVADA", rl)}>Reprovar</Button>
            </>
          ) : null} />
      )}
      {toast.node}
    </Box>
  );
}

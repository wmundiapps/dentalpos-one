import { Alert, Box, Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog } from "../desempenho/kit";
import { Async, Panel, Situacao, Stat, StatGrid, Sub, TES, brl, erroCompleto, fmtDate, isoDia, label, num, useApi, useMotivo, useToast } from "./tes";

function Permutas() {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<any | null>(null);
  const toast = useToast();
  const motivo = useMotivo();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Permuta = pagamento com bens ou serviços. Exige <b>documento de suporte</b> (contrato, nota, termo) e aprovação por pessoa diferente de quem registrou. Ao quitar uma mensalidade (ou um título a pagar) o valor equivalente deve ser <b>igual</b> ao valor da parcela; a contrapartida contábil é lançada automaticamente e não há movimento de caixa.</Alert>
      <ListTable path={`${TES}/permutas`} refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["RASCUNHO", "APROVADA", "LIQUIDADA", "CANCELADA"] }, { key: "sentido", label: "Sentido", options: ["RECEBER", "PAGAR"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Nova permuta</Button>}
        columns={[
          { key: "numero", label: "Nº", render: (p) => <b>{p.numero}</b> },
          { key: "sentido", label: "Sentido", render: (p) => (p.sentido === "RECEBER" ? "Recebe bem/serviço" : "Paga com bem/serviço") },
          { key: "parteNome", label: "Parte", render: (p) => <>{p.parteNome}<Sub>{p.descricao}</Sub></> },
          { key: "documentoNumero", label: "Documento", render: (p) => `${label(p.documentoTipo)} ${p.documentoNumero}` },
          { key: "valorEquivalente", label: "Valor equivalente", align: "right", render: (p) => brl(p.valorEquivalente) },
          { key: "status", label: "Situação", render: (p) => <Situacao value={p.status} /> },
        ]}
        actions={(p) => (
          <>
            <Button size="small" onClick={async () => setDet(await eduApi.get(`${TES}/permutas/${p.id}`))}>Contrapartida</Button>
            {p.status === "RASCUNHO" && <Button size="small" color="success" onClick={() => toast.run(() => eduApi.post(`${TES}/permutas/${p.id}/aprovar`, {}), "Permuta aprovada.", reload, `Aprovar a permuta ${p.numero}? (quem registrou não pode aprovar)`)}>Aprovar</Button>}
            {["RASCUNHO", "APROVADA"].includes(p.status) && <Button size="small" color="error" onClick={async () => { const m = await motivo.ask(`Cancelar permuta ${p.numero}`); if (!m) return; try { await eduApi.post(`${TES}/permutas/${p.id}/cancelar`, { motivo: m }); toast.ok("Permuta cancelada."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); } }}>Cancelar</Button>}
          </>
        )} />
      <FormDialog open={novo} title="Nova permuta" onClose={() => setNovo(false)} initial={{ sentido: "RECEBER", tipoContrapartida: "SERVICO", documentoTipo: "CONTRATO", dataAcordo: isoDia(0) }}
        fields={[
          { key: "sentido", label: "Sentido", type: "select", options: [{ value: "RECEBER", label: "Receber bem/serviço (quita mensalidade)" }, { value: "PAGAR", label: "Pagar com bem/serviço (quita título a pagar)" }], required: true },
          { key: "tipoContrapartida", label: "Contrapartida", type: "select", options: ["BEM", "SERVICO", "CESSAO_ESPACO", "PUBLICIDADE", "OUTRO"], required: true },
          { key: "parteNome", label: "Parte (pessoa/empresa)", required: true }, { key: "parteDocumento", label: "CPF/CNPJ da parte" },
          { key: "descricao", label: "Descrição do bem/serviço", required: true, full: true },
          { key: "valorEquivalente", label: "Valor equivalente (R$)", type: "number", required: true, helper: "Deve ser igual ao valor da parcela/título que será quitado" },
          { key: "dataAcordo", label: "Data do acordo", type: "date" },
          { key: "documentoTipo", label: "Documento de suporte", type: "select", options: ["CONTRATO", "NOTA_FISCAL", "TERMO", "RECIBO"], required: true }, { key: "documentoNumero", label: "Nº do documento", required: true },
          { key: "receivableId", label: "ID da mensalidade (opcional)", hidden: (v) => v.sentido !== "RECEBER" }, { key: "tituloId", label: "ID do título a pagar (opcional)", hidden: (v) => v.sentido !== "PAGAR" },
          { key: "observacao", label: "Observação", full: true },
        ]}
        onSubmit={async (b) => { const p = await eduApi.post(`${TES}/permutas`, b); toast.ok(`Permuta ${p.numero} registrada; aguarda aprovação.`); reload(); }} />
      {det && (
        <Panel sx={{ mt: 2 }} title={`Permuta ${det.numero} — contrapartida contábil`} actions={<Button size="small" onClick={() => setDet(null)}>Fechar</Button>}>
          {det.lancamento ? (
            <Typography variant="body2">Lançamento de {fmtDate(det.lancamento.data)}: <b>D</b> {det.lancamento.contaDebito.codigo} {det.lancamento.contaDebito.nome} · <b>C</b> {det.lancamento.contaCredito.codigo} {det.lancamento.contaCredito.nome} · <b>{brl(det.lancamento.valor)}</b><br />{det.lancamento.historico}</Typography>
          ) : <Typography variant="body2" color="text.secondary">Ainda sem lançamento: a contrapartida é gerada quando a permuta (aprovada) quita uma mensalidade ou um título.</Typography>}
        </Panel>
      )}
      {toast.node}{motivo.node}
    </Box>
  );
}

function Bolsas() {
  const [key, setKey] = useState(0);
  const st = useApi<any>(`${TES}/bolsas/conferencia?_=${key}`);
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="info">As bolsas do módulo <b>Apoio ao Estudante</b> são aplicadas automaticamente nas mensalidades (percentual + valor fixo das concessões vigentes na data de vencimento). Esta conferência confronta o que foi aplicado com as concessões.</Alert>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => toast.run(() => eduApi.post(`${TES}/recebiveis/aplicar-bolsas`, {}), "Bolsas reaplicadas.", () => setKey((k) => k + 1), "Reaplicar as bolsas vigentes nas mensalidades em aberto?")}>Aplicar / corrigir bolsas</Button>
        <Button onClick={() => setKey((k) => k + 1)}>Conferir novamente</Button>
      </Box>
      <Async state={st}>
        {(c) => (
          <>
            <StatGrid min={150}>
              <Stat label="Mensalidades analisadas" value={num(c.analisadas, 0)} />
              <Stat label="Conformes" value={num(c.conferidas, 0)} tone="success" />
              <Stat label="Divergentes" value={num(c.divergentes, 0)} tone={c.divergentes ? "error" : "success"} />
              <Stat label="Concessões ativas" value={num(c.concessoesAtivas, 0)} />
            </StatGrid>
            <Panel title="Divergências">
              {c.divergencias.length === 0 && <Typography variant="body2" color="text.secondary">Nenhuma divergência entre as mensalidades e as concessões de bolsa.</Typography>}
              {c.divergencias.map((d: any) => (
                <Box key={d.receivableId} sx={{ py: 1, borderBottom: 1, borderColor: "divider", display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{d.aluno?.nomeCompleto || d.aluno?.id} {d.aluno?.ra ? `(${d.aluno.ra})` : ""}</Typography>
                    <Sub>{d.descricao} · vence {fmtDate(d.vencimento)}</Sub><Sub>{d.motivo}</Sub>
                  </Box>
                  <Typography variant="body2">Esperada <b>{brl(d.bolsaEsperada)}</b> · aplicada <b>{brl(d.bolsaAplicada)}</b> · dif. <b style={{ color: "#c62828" }}>{brl(d.diferenca)}</b></Typography>
                </Box>
              ))}
            </Panel>
          </>
        )}
      </Async>
      {toast.node}
    </Box>
  );
}

export default function PermutasBolsasTab() {
  const [sub, setSub] = useState("permutas");
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[["permutas", "Permutas"], ["bolsas", "Bolsas e descontos"]].map(([k, l]) => (
          <Button key={k} variant={sub === k ? "contained" : "outlined"} size="small" onClick={() => setSub(k)} sx={{ textTransform: "none", fontWeight: 700 }}>{l}</Button>
        ))}
      </Box>
      {sub === "permutas" ? <Permutas /> : <Bolsas />}
    </Box>
  );
}

import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog, Pick } from "../desempenho/kit";
import { Async, Panel, Situacao, Stat, StatGrid, Sub, TES, brl, erroCompleto, fmtDate, isoDia, label, lerArquivoTexto, num, useApi, useContas, useMotivo, useToast } from "./tes";

// ---------------------------------------------------------------- contas e caixa
function Contas() {
  const [key, setKey] = useState(0);
  const st = useApi<any>(`${TES}/contas?_=${key}`);
  const { contas } = useContas();
  const [form, setForm] = useState<any | null>(null);
  const [transf, setTransf] = useState(false);
  const [mov, setMov] = useState(false);
  const [ver, setVer] = useState<any | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={st}>
        {(d) => (
          <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Saldo total: {brl(d.saldoTotal)}</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ tipo: "BANCO", provedor: "SIMULADO", saldoInicial: 0 })}>Nova conta / caixa</Button>
              <Button onClick={() => setTransf(true)}>Transferência</Button>
              <Button onClick={() => setMov(true)}>Tarifa / rendimento</Button>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }, gap: 1.5 }}>
              {d.items.map((c: any) => (
                <Panel key={c.id} sx={{ opacity: c.ativa ? 1 : 0.55 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 800, flex: 1 }}>{c.nome}</Typography>
                    <Chip size="small" label={c.tipo} />{c.padraoPagamento && <Chip size="small" color="primary" label="Pagadora padrão" />}
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: c.saldo < 0 ? "error.main" : undefined }}>{brl(c.saldo)}</Typography>
                  <Sub>{c.bancoNome || c.bancoCodigo ? `${c.bancoCodigo || ""} ${c.bancoNome || ""} · ag. ${c.agencia || "—"} · cc ${c.numeroConta || "—"}${c.digito ? "-" + c.digito : ""}` : "Caixa físico"}</Sub>
                  <Sub>Provedor: {c.provedor}{c.provedor === "SIMULADO" ? " (sem integração real)" : ""}</Sub>
                  <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                    <Button size="small" onClick={() => setVer(c)}>Movimentos</Button>
                    <Button size="small" onClick={() => setForm(c)}>Editar</Button>
                  </Box>
                </Panel>
              ))}
            </Box>
          </>
        )}
      </Async>
      <FormDialog open={!!form} title={form?.id ? "Editar conta" : "Nova conta bancária / caixa"} onClose={() => setForm(null)} initial={form || {}}
        fields={[
          { key: "tipo", label: "Tipo", type: "select", options: ["BANCO", "CAIXA", "APLICACAO"], required: true },
          { key: "nome", label: "Nome", required: true },
          { key: "bancoCodigo", label: "Código do banco (ex.: 341)", hidden: (v) => v.tipo === "CAIXA" },
          { key: "bancoNome", label: "Nome do banco", hidden: (v) => v.tipo === "CAIXA" },
          { key: "agencia", label: "Agência", hidden: (v) => v.tipo === "CAIXA" },
          { key: "numeroConta", label: "Conta", hidden: (v) => v.tipo === "CAIXA" },
          { key: "digito", label: "Dígito", hidden: (v) => v.tipo === "CAIXA" },
          { key: "titularNome", label: "Titular (razão social)", hidden: (v) => v.tipo === "CAIXA", helper: "Obrigatório para gerar remessa" },
          { key: "titularDocumento", label: "CNPJ do titular", hidden: (v) => v.tipo === "CAIXA" },
          { key: "convenio", label: "Convênio / código da empresa no banco", hidden: (v) => v.tipo === "CAIXA" },
          { key: "provedor", label: "Provedor bancário", type: "select", options: ["SIMULADO"], helper: "Integração real exige credenciais e homologação" },
          { key: "saldoInicial", label: "Saldo inicial (R$)", type: "number" },
          { key: "padraoPagamento", label: "Conta pagadora padrão", type: "bool" },
          { key: "ativa", label: "Conta ativa", type: "bool" },
        ]}
        onSubmit={async (b) => {
          if (form?.id) { await eduApi.put(`${TES}/contas/${form.id}`, b); toast.ok("Conta atualizada."); }
          else { await eduApi.post(`${TES}/contas`, { ativa: true, ...b }); toast.ok("Conta criada."); }
          reload();
        }} />
      <FormDialog open={transf} title="Transferência entre contas" onClose={() => setTransf(false)} initial={{ data: isoDia(0) }}
        fields={[
          { key: "origemId", label: "Origem", type: "select", options: contas, required: true }, { key: "destinoId", label: "Destino", type: "select", options: contas, required: true },
          { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "data", label: "Data", type: "date" }, { key: "descricao", label: "Descrição", full: true },
        ]}
        onSubmit={async (b) => { await eduApi.post(`${TES}/transferencias`, b); toast.ok("Transferência registrada."); reload(); }} />
      <FormDialog open={mov} title="Tarifa, rendimento ou ajuste" onClose={() => setMov(false)} initial={{ data: isoDia(0), tipo: "TARIFA" }}
        fields={[
          { key: "contaId", label: "Conta", type: "select", options: contas, required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["TARIFA", "RENDIMENTO", "AJUSTE"], required: true },
          { key: "valor", label: "Valor (R$)", type: "number", required: true, helper: "Tarifa: informe positivo (sai do saldo). Ajuste: use sinal." }, { key: "data", label: "Data", type: "date" },
          { key: "descricao", label: "Descrição", required: true, full: true },
        ]}
        onSubmit={async (b) => { await eduApi.post(`${TES}/movimentos`, b); toast.ok("Movimento lançado."); reload(); }} />
      {ver && (
        <Dialog open onClose={() => setVer(null)} fullWidth maxWidth="md">
          <DialogTitle sx={{ fontWeight: 800 }}>Movimentos — {ver.nome}</DialogTitle>
          <DialogContent dividers>
            <ListTable path={`${TES}/contas/${ver.id}/extrato-sistema`} searchable={false} pageSize={15}
              columns={[
                { key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "descricao", label: "Descrição" },
                { key: "valor", label: "Valor", align: "right", render: (r) => <span style={{ color: r.valor < 0 ? "#c62828" : "#2e7d32", fontWeight: 700 }}>{brl(r.valor)}</span> },
                { key: "conciliado", label: "Conciliado", render: (r) => (r.conciliado ? <Situacao value="OK" /> : <Situacao value="PENDENTE" />) },
              ]} />
          </DialogContent>
          <DialogActions><Button onClick={() => setVer(null)}>Fechar</Button></DialogActions>
        </Dialog>
      )}
      {toast.node}
    </Box>
  );
}

// ---------------------------------------------------------------- conciliação
function Sugestoes({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const st = useApi<any>(`${TES}/extratos/itens/${item.id}/sugestoes`);
  const toast = useToast();
  async function conciliar(s: any) {
    const msg = s.tipo === "RECEBIVEL" ? `Baixar a mensalidade "${s.descricao}" por Pix e conciliar com este crédito?` : `Conciliar com "${s.descricao}"?`;
    if (!window.confirm(msg)) return;
    try { await eduApi.post(`${TES}/extratos/itens/${item.id}/conciliar`, { tipo: s.tipo, id: s.id, forma: "PIX" }); onDone(); onClose(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Conciliar lançamento</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2"><b>{fmtDate(item.data)}</b> · {item.descricao}</Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, color: item.valor < 0 ? "error.main" : "success.main" }}>{brl(item.valor)}</Typography>
        <Async state={st}>
          {(d) => (
            <Box sx={{ display: "grid", gap: 1, mt: 1 }}>
              {d.sugestoes.length === 0 && <Alert severity="info">Sem candidatos de mesmo valor. Use "Lançar" (tarifa/rendimento) ou "Ignorar".</Alert>}
              {d.sugestoes.map((s: any) => (
                <Box key={s.tipo + s.id} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.25, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.descricao}</Typography>
                    <Sub>{label(s.tipo)} · {brl(s.valor)} · {s.data ? fmtDate(s.data) : "—"}</Sub>
                    <Sub>{s.motivos.join(" · ")}</Sub>
                  </Box>
                  <Chip size="small" color={s.score >= 0.8 ? "success" : s.score >= 0.6 ? "warning" : "default"} label={`${Math.round(s.score * 100)}%`} />
                  <Button size="small" variant="contained" onClick={() => conciliar(s)}>{s.tipo === "RECEBIVEL" ? "Baixar e conciliar" : "Conciliar"}</Button>
                </Box>
              ))}
            </Box>
          )}
        </Async>
        {toast.node}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Conciliacao() {
  const { contas } = useContas();
  const bancos = contas.filter((c) => c.tipo !== "CAIXA");
  const [contaId, setContaId] = useState("");
  const [key, setKey] = useState(0);
  const [sug, setSug] = useState<any | null>(null);
  const [texto, setTexto] = useState("");
  const [nome, setNome] = useState("");
  const [imp, setImp] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const motivo = useMotivo();
  const resumo = useApi<any>(`${TES}/conciliacao/resumo?_=${key}`);
  const reload = () => setKey((k) => k + 1);
  const conta = contaId || bancos[0]?.value || "";

  async function importar() {
    try {
      const r = await eduApi.post(`${TES}/extratos/importar`, { contaId: conta, conteudo: texto, nomeArquivo: nome || undefined, autoConciliar: true });
      toast.ok(`${r.novos} lançamento(s) importado(s), ${r.duplicadasIgnoradas} já existiam.${r.conciliacao ? ` Conciliados automaticamente: ${r.conciliacao.conciliados}.` : ""}`);
      setImp(false); setTexto(""); setNome(""); reload();
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  async function auto() {
    try { const r = await eduApi.post(`${TES}/conciliacao/automatica`, { contaId: conta }); toast.ok(`${r.conciliados} conciliado(s) automaticamente; ${r.comSugestao} com sugestão; ${r.semCandidato} sem candidato.`); reload(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  const r = (resumo.data?.contas || []).find((c: any) => c.contaId === conta);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <Pick label="Conta" value={conta} onChange={setContaId} options={bancos} minWidth={240} />
        <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => setImp(true)} disabled={!conta}>Importar extrato (OFX/CSV)</Button>
        <Button onClick={auto} disabled={!conta}>Conciliar automaticamente</Button>
      </Box>
      {r && (
        <StatGrid min={150}>
          <Stat label="Saldo no sistema" value={brl(r.saldoSistema)} hint={r.saldoExtrato != null ? `Extrato: ${brl(r.saldoExtrato)}` : undefined} />
          <Stat label="Extrato a conciliar" value={num(r.itensPendentes, 0)} hint={brl(r.valorPendente)} tone={r.itensPendentes ? "warning" : "success"} />
          <Stat label="Conciliados" value={num(r.itensConciliados, 0)} tone="success" />
          <Stat label="No sistema sem extrato" value={num(r.movimentosSistemaSemExtrato, 0)} hint={brl(r.valorSistemaSemExtrato)} />
        </StatGrid>
      )}
      <Panel title="Lançamentos do extrato">
        {conta ? (
          <ListTable path={`${TES}/extratos/itens`} refreshKey={key} searchable={false} extraQuery={{ contaId: conta }}
            filters={[{ key: "status", label: "Situação", options: ["PENDENTE", "CONCILIADO", "IGNORADO"] }]}
            columns={[
              { key: "data", label: "Data", render: (i) => fmtDate(i.data) },
              { key: "descricao", label: "Descrição", render: (i) => <>{i.descricao}<Sub>{i.documento}</Sub></> },
              { key: "valor", label: "Valor", align: "right", render: (i) => <b style={{ color: i.valor < 0 ? "#c62828" : "#2e7d32" }}>{brl(i.valor)}</b> },
              { key: "status", label: "Situação", render: (i) => <><Situacao value={i.status} />{i.metodo && <Sub>{i.metodo === "AUTO" ? "automática" : "manual"} {i.score ? `${Math.round(i.score * 100)}%` : ""}</Sub>}</> },
            ]}
            actions={(i) => (
              i.status === "PENDENTE" ? (
                <>
                  <Button size="small" variant="contained" onClick={() => setSug(i)}>Conciliar</Button>
                  <Button size="small" onClick={async () => { try { await eduApi.post(`${TES}/extratos/itens/${i.id}/conciliar`, { tipo: "NOVO_MOVIMENTO", movimentoTipo: i.valor < 0 ? "TARIFA" : "RENDIMENTO" }); toast.ok("Lançamento criado e conciliado."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); } }}>Lançar</Button>
                  <Button size="small" color="inherit" onClick={async () => { const m = await motivo.ask("Ignorar lançamento do extrato", 3); if (!m) return; try { await eduApi.post(`${TES}/extratos/itens/${i.id}/ignorar`, { motivo: m }); reload(); } catch (e: any) { toast.err(erroCompleto(e)); } }}>Ignorar</Button>
                </>
              ) : (
                <Button size="small" color="warning" onClick={() => toast.run(() => eduApi.post(`${TES}/extratos/itens/${i.id}/desfazer`, {}), "Conciliação desfeita.", reload, "Desfazer esta conciliação?")}>Desfazer</Button>
              )
            )} />
        ) : <Typography color="text.secondary">Cadastre uma conta bancária para importar extratos.</Typography>}
      </Panel>
      {sug && <Sugestoes item={sug} onClose={() => setSug(null)} onDone={() => { toast.ok("Conciliado."); reload(); }} />}
      <Dialog open={imp} onClose={() => setImp(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 800 }}>Importar extrato</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>Aceita OFX (1.x e 2.x) e CSV (colunas de data, histórico e valor — ou crédito/débito). Arquivos repetidos e linhas já importadas são ignorados. Após importar, a conciliação automática pareia o que for inequívoco.</Alert>
          <input ref={arq} type="file" accept=".ofx,.csv,.txt,.OFX,.CSV" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setTexto(await lerArquivoTexto(f)); setNome(f.name); } e.target.value = ""; }} />
          <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Button startIcon={<UploadFileIcon />} onClick={() => arq.current?.click()}>Escolher arquivo</Button>
            <Typography variant="body2" color="text.secondary">{nome ? `${nome} (${num(texto.length / 1024, 1)} KB)` : "ou cole o conteúdo abaixo"}</Typography>
          </Box>
          <TextField fullWidth multiline minRows={6} maxRows={14} size="small" label="Conteúdo do extrato" value={texto} onChange={(e) => setTexto(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setImp(false)}>Cancelar</Button><Button variant="contained" disabled={texto.trim().length < 10} onClick={importar}>Importar e conciliar</Button></DialogActions>
      </Dialog>
      {toast.node}{motivo.node}
    </Box>
  );
}

// ---------------------------------------------------------------- alçadas e configuração
type Faixa = { nome: string; valorAte: string; papeis: string; aprovacoes: string; exige2fa: boolean };
const PAPEIS = "COORDINATOR, FINANCE, RECTOR, ADMIN, OWNER, BOARD";

function Config() {
  const [key, setKey] = useState(0);
  const st = useApi<any>(`${TES}/config?_=${key}`);
  const [edit, setEdit] = useState(false);
  const [faixas, setFaixas] = useState<Faixa[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const abrirFaixas = (a: any[]) => setFaixas(a.map((f) => ({ nome: f.nome, valorAte: f.valorAte == null ? "" : String(f.valorAte), papeis: f.papeis.join(", "), aprovacoes: String(f.aprovacoes), exige2fa: !!f.exige2fa })));
  async function salvarFaixas() {
    setErr(null);
    try {
      await eduApi.put(`${TES}/alcadas`, { faixas: (faixas || []).map((f) => ({ nome: f.nome, valorAte: f.valorAte === "" ? null : Number(f.valorAte), papeis: f.papeis.split(",").map((x) => x.trim()).filter(Boolean), aprovacoes: Number(f.aprovacoes) || 1, exige2fa: f.exige2fa })) });
      setFaixas(null); toast.ok("Alçadas atualizadas."); reload();
    } catch (e: any) { setErr(erroCompleto(e)); }
  }
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Panel title="Alçadas de autorização" subtitle={d.alcadasPadrao ? "Usando as alçadas padrão (somente a diretoria pode personalizar)" : "Alçadas personalizadas"}
            actions={<Box sx={{ display: "flex", gap: 1 }}><Button onClick={() => abrirFaixas(d.alcadas)}>Editar alçadas</Button>{!d.alcadasPadrao && <Button color="warning" onClick={() => toast.run(() => eduApi.del(`${TES}/alcadas`), "Alçadas padrão restauradas.", reload, "Restaurar as alçadas padrão?")}>Restaurar padrão</Button>}</Box>}>
            {d.alcadas.map((f: any) => (
              <Box key={f.ordem} sx={{ py: 0.75, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{f.nome}</Typography>
                <Sub>Até {f.valorAte == null ? "sem limite" : brl(f.valorAte)} · autorizam: {f.papeis.join(", ")} (e diretoria) · {f.aprovacoes} aprovação(ões){f.exige2fa ? " · exige 2FA" : ""}</Sub>
              </Box>
            ))}
            <Sub>Dupla aprovação obrigatória acima de {brl(d.config.limiteDuplaAprovacao)}. 2FA exigido acima de {d.config.exige2faAcima == null ? "— (desligado)" : brl(d.config.exige2faAcima)}.</Sub>
          </Panel>
          <Panel title="Política financeira e fiscal" actions={<Button onClick={() => setEdit(true)}>Editar</Button>}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 0.5 }}>
              <Typography variant="body2">Regime tributário: <b>{label(d.config.regimeTributario)}</b></Typography>
              <Typography variant="body2">Série de recibos: <b>{d.config.serieRecibo}</b></Typography>
              <Typography variant="body2">Conferente não autoriza: <b>{d.config.conferenteNaoAutoriza ? "sim" : "não"}</b></Typography>
              <Typography variant="body2">Tolerância de conciliação: <b>{d.config.toleranciaDiasConciliacao} dia(s)</b></Typography>
              <Typography variant="body2">INSS (RPA/pró-labore): <b>{d.config.inssPercentualRpa}%</b> até o teto <b>{brl(d.config.tetoInss)}</b></Typography>
              <Typography variant="body2">ISS padrão: <b>{d.config.issPercentualPadrao}%</b></Typography>
              <Typography variant="body2">Sistema contábil de destino: <b>{d.config.sistemaContabil || "—"}</b></Typography>
            </Box>
            <Alert severity="warning" sx={{ mt: 1.5 }}>Alíquotas, tetos e tabelas são modelos configuráveis: valide com o contador antes de usar em folha ou impostos.</Alert>
          </Panel>
          <FormDialog open={edit} title="Política financeira e fiscal" onClose={() => setEdit(false)} initial={d.config}
            fields={[
              { key: "regimeTributario", label: "Regime tributário", type: "select", options: ["IMUNE_ISENTA", "SIMPLES", "LUCRO_PRESUMIDO", "LUCRO_REAL"] },
              { key: "serieRecibo", label: "Série dos recibos" },
              { key: "limiteDuplaAprovacao", label: "Dupla aprovação acima de (R$)", type: "number" },
              { key: "exige2faAcima", label: "Exigir 2FA acima de (R$)", type: "number", helper: "Vazio = desligado" },
              { key: "conferenteNaoAutoriza", label: "Quem conferiu não pode autorizar", type: "bool" },
              { key: "toleranciaDiasConciliacao", label: "Tolerância de datas na conciliação (dias)", type: "number" },
              { key: "inssPercentualRpa", label: "INSS RPA/pró-labore (%)", type: "number" }, { key: "tetoInss", label: "Teto do INSS (R$)", type: "number" },
              { key: "issPercentualPadrao", label: "ISS padrão (%)", type: "number" }, { key: "sistemaContabil", label: "Sistema contábil de destino" },
            ]}
            onSubmit={async (b, raw) => { await eduApi.put(`${TES}/config`, { ...b, exige2faAcima: raw.exige2faAcima === "" || raw.exige2faAcima == null ? null : Number(raw.exige2faAcima) }); toast.ok("Configuração salva."); reload(); }} />
          <Dialog open={!!faixas} onClose={() => setFaixas(null)} fullWidth maxWidth="md">
            <DialogTitle sx={{ fontWeight: 800 }}>Alçadas de autorização</DialogTitle>
            <DialogContent dividers>
              {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
              <Alert severity="info" sx={{ mb: 2 }}>Faixas por valor, em ordem crescente; a última deve ser sem limite. Papéis: {PAPEIS}. Apenas ADMIN/OWNER/RECTOR/BOARD podem salvar.</Alert>
              {(faixas || []).map((f, i) => (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 2fr 0.7fr auto" }, gap: 1, mb: 1.5, alignItems: "center" }}>
                  <TextField size="small" label="Nome" value={f.nome} onChange={(e) => setFaixas((l) => l!.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                  <TextField size="small" type="number" label="Até (R$)" value={f.valorAte} placeholder="sem limite" onChange={(e) => setFaixas((l) => l!.map((x, j) => (j === i ? { ...x, valorAte: e.target.value } : x)))} />
                  <TextField size="small" label="Papéis" value={f.papeis} onChange={(e) => setFaixas((l) => l!.map((x, j) => (j === i ? { ...x, papeis: e.target.value } : x)))} />
                  <TextField select size="small" label="Aprov." value={f.aprovacoes} onChange={(e) => setFaixas((l) => l!.map((x, j) => (j === i ? { ...x, aprovacoes: e.target.value } : x)))}>{["1", "2", "3"].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}</TextField>
                  <Button size="small" color="error" onClick={() => setFaixas((l) => (l!.length > 1 ? l!.filter((_, j) => j !== i) : l))}>Remover</Button>
                </Box>
              ))}
              <Button startIcon={<AddIcon />} onClick={() => setFaixas((l) => [...(l || []), { nome: "Nova faixa", valorAte: "", papeis: "FINANCE", aprovacoes: "1", exige2fa: false }])}>Adicionar faixa</Button>
            </DialogContent>
            <DialogActions><Button onClick={() => setFaixas(null)}>Cancelar</Button><Button variant="contained" onClick={salvarFaixas}>Salvar alçadas</Button></DialogActions>
          </Dialog>
          {toast.node}
        </Box>
      )}
    </Async>
  );
}

export default function BancosTab() {
  const [sub, setSub] = useState("contas");
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[["contas", "Contas e caixa"], ["conc", "Extrato e conciliação"], ["cfg", "Alçadas e política"]].map(([k, l]) => (
          <Button key={k} variant={sub === k ? "contained" : "outlined"} size="small" onClick={() => setSub(k)} sx={{ textTransform: "none", fontWeight: 700 }}>{l}</Button>
        ))}
      </Box>
      {sub === "contas" ? <Contas /> : sub === "conc" ? <Conciliacao /> : <Config />}
    </Box>
  );
}

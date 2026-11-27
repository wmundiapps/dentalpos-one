import { Alert, Box, Button, Tab, Tabs, Typography } from "@mui/material";
import { useMemo, useState, type ReactNode } from "react";
import { readSessionUser } from "../../services/DemoAccess";
import {
  AlertaChip, DataList, FormDialog, J, Kpi, KpiRow, LoadBox, ResourceTab, Section, Status, call, fmtDT, fmtDate, fmtMoney, itemsOf, label, opts, useApi, usePessoas, useRunner, useToast, type FormField, type Opt,
} from "./kit2";

const LEITORES = ["ADMIN", "OWNER", "RECTOR", "BOARD", "FACILITIES", "COORDINATOR", "FINANCE", "SUPPLIES", "SECRETARY", "SUPPORT", "STAFF"];
const GESTORES = ["ADMIN", "OWNER", "RECTOR", "BOARD", "FACILITIES"];
const role = () => String(readSessionUser()?.role || "").toUpperCase();
const COMB = ["GASOLINA", "ETANOL", "FLEX", "DIESEL", "ELETRICO", "GNV"];

function useVeiculos(): Opt[] {
  const l = useApi<any>(`${J}/frota/veiculos?pageSize=200`);
  return itemsOf(l.data).map((v: any) => ({ value: v.id, label: `${v.placa} · ${v.apelido || v.modelo}` }));
}
function useMotoristas(): Opt[] {
  const l = useApi<any>(`${J}/frota/motoristas?pageSize=200&ativo=true`);
  return itemsOf(l.data).map((m: any) => ({ value: m.id, label: m.nome }));
}

function PainelFrota() {
  const p = useApi<any>(`${J}/frota/painel`);
  const a = useApi<any>(`${J}/frota/alertas?dias=90`);
  const x = p.data;
  return (
    <>
      <KpiRow>
        <Kpi title="Veículos" value={x?.veiculos ?? "—"} hint={x ? `${x.ativos} ativos · ${x.emManutencao} em manutenção` : undefined} />
        <Kpi title="Multas abertas" value={x?.multasAbertas ?? "—"} hint={x ? fmtMoney(x.multasValorAberto) : undefined} color={x?.multasAbertas ? "#e0a100" : undefined} />
        <Kpi title="A ressarcir" value={fmtMoney(x?.aRessarcir)} /><Kpi title="Reservas pendentes" value={x?.reservasPendentes ?? "—"} /><Kpi title="Em viagem" value={x?.emViagem ?? "—"} />
        <Kpi title="Alertas (90 d)" value={x?.alertas ?? "—"} color={x?.vencidos ? "#d64545" : undefined} hint={x ? `${x.vencidos} vencidos` : undefined} />
      </KpiRow>
      <Section title="Alertas de vencimento (documentos, seguros, CNH, revisões, multas)">
        <LoadBox loading={a.loading} error={a.error} empty={!itemsOf(a.data?.itens).length && !(a.data?.itens ?? []).length} emptyText="Nada vence nos próximos 90 dias." onRetry={a.reload}>
          <DataList<any> rows={(a.data?.itens ?? []).map((i: any, k: number) => ({ ...i, id: i.refId + k }))} columns={[
            { label: "Item", primary: true, render: (i) => <><b>{i.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{label(i.tipo)}{i.veiculo ? ` · ${i.veiculo}` : ""}</Typography></> },
            { label: "Vence em", render: (i) => fmtDate(i.vencimento) }, { label: "Prazo", render: (i) => <AlertaChip alerta={{ dias: i.dias, faixa: i.faixa }} /> }, { label: "Responsável", render: (i) => i.responsavel || "—" },
          ]} />
        </LoadBox>
      </Section>
      <Section title="Custo por km (últimos 12 meses)">
        <LoadBox loading={p.loading} error={p.error} empty={!(x?.custoPorKm ?? []).length} emptyText="Cadastre veículos e registre quilometragem/abastecimento." onRetry={p.reload}>
          <DataList<any> rows={(x?.custoPorKm ?? []).map((c: any) => ({ ...c, id: c.veiculoId }))} columns={[
            { label: "Veículo", primary: true, render: (c) => c.placa }, { label: "Km", render: (c) => c.km.toLocaleString("pt-BR") }, { label: "Combustível", hideOnMobile: true, render: (c) => fmtMoney(c.combustivel) },
            { label: "Manutenção", hideOnMobile: true, render: (c) => fmtMoney(c.manutencao) }, { label: "Multas", hideOnMobile: true, render: (c) => fmtMoney(c.multas) }, { label: "Seguro", hideOnMobile: true, render: (c) => fmtMoney(c.seguro) },
            { label: "Total", render: (c) => fmtMoney(c.total) }, { label: "R$/km", render: (c) => (c.custoPorKm == null ? "—" : <b>{c.custoPorKm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b>) }, { label: "km/l", render: (c) => c.consumoKmPorLitro ?? "—" },
          ]} />
        </LoadBox>
      </Section>
    </>
  );
}

function MinhasReservas({ veiculos }: { veiculos: Opt[] }) {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const l = useApi<any>(`${J}/frota/reservas/minhas`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <Section title="Minhas reservas de veículo" actions={<Button variant="contained" onClick={() => setNovo(true)}>Reservar veículo</Button>}>
      {node}
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Você não tem reservas." onRetry={l.reload}>
        <DataList<any> rows={itemsOf(l.data)} columns={[
          { label: "Viagem", primary: true, render: (r) => <><b>{r.destino}</b><Typography variant="caption" component="div" color="text.secondary">{r.numero} · {r.finalidade}</Typography></> },
          { label: "Saída", render: (r) => fmtDT(r.saidaPrevista) }, { label: "Retorno", render: (r) => fmtDT(r.retornoPrevisto) }, { label: "Motorista", render: (r) => r.motoristaNome || "—" }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]} actions={(r) => (["SOLICITADA", "APROVADA"].includes(r.status) ? <Button size="small" color="error" onClick={() => { void run(() => call("POST", `${J}/frota/reservas/${r.id}/cancelar`), "Reserva cancelada.", "Cancelar a reserva?"); }}>Cancelar</Button> : null)} />
      </LoadBox>
      <FormDialog open={novo} title="Reservar veículo" onClose={() => setNovo(false)} maxWidth="sm" submitLabel="Solicitar" fields={RESERVA_FIELDS(veiculos, [])}
        onSubmit={async (b) => { await call("POST", `${J}/frota/reservas`, b); setNovo(false); setRev((x) => x + 1); toast({ type: "success", text: "Reserva solicitada." }); }} />
    </Section>
  );
}
const RESERVA_FIELDS = (veiculos: Opt[], motoristas: Opt[]): FormField[] => [
  { key: "veiculoId", label: "Veículo", type: "select", required: true, options: veiculos },
  ...(motoristas.length ? [{ key: "motoristaId", label: "Motorista", type: "select" as const, options: motoristas }] : []),
  { key: "finalidade", label: "Finalidade", required: true, full: true }, { key: "destino", label: "Destino", required: true }, { key: "passageiros", label: "Passageiros", type: "number" },
  { key: "saidaPrevista", label: "Saída", type: "datetime", required: true }, { key: "retornoPrevisto", label: "Retorno previsto", type: "datetime", required: true },
];

export default function FrotaTab() {
  const [sub, setSub] = useState(0);
  const [dlg, setDlg] = useState<null | { kind: string; row: any }>(null);
  const [rev, setRev] = useState(0);
  const veiculos = useVeiculos();
  const motoristas = useMotoristas();
  const pessoas = usePessoas();
  const leitor = LEITORES.includes(role());
  const gestor = GESTORES.includes(role());
  const vNome = useMemo(() => Object.fromEntries(veiculos.map((v) => [v.value, v.label.split(" · ")[0]])), [veiculos]);
  const bump = () => setRev((x) => x + 1);
  const V: FormField = { key: "veiculoId", label: "Veículo", type: "select", required: true, options: veiculos };
  const filtroV = { key: "veiculoId", label: "Veículo", options: veiculos };
  if (!leitor) return <MinhasReservas veiculos={veiculos} />;

  const telas: Array<{ k: string; l: string; el: ReactNode }> = [
    { k: "painel", l: "Painel", el: <PainelFrota /> },
    { k: "veiculos", l: "Veículos", el: (
      <ResourceTab title="Veículos" path="/frota/veiculos" newLabel="Novo veículo" anexoRef="Veiculo" refreshKey={rev} canCreate={gestor} editable={gestor}
        fields={[
          { key: "placa", label: "Placa", required: true }, { key: "apelido", label: "Apelido" }, { key: "marca", label: "Marca", required: true }, { key: "modelo", label: "Modelo", required: true }, { key: "ano", label: "Ano", type: "number" },
          { key: "tipo", label: "Tipo", type: "select", options: opts(["CARRO", "VAN", "ONIBUS", "MICROONIBUS", "UTILITARIO", "MOTO", "CAMINHAO"]) }, { key: "combustivel", label: "Combustível", type: "select", options: opts(COMB) },
          { key: "capacidade", label: "Lugares", type: "number" }, { key: "odometroKm", label: "Odômetro (km)", type: "number" }, { key: "status", label: "Situação", type: "select", options: opts(["ATIVO", "EM_MANUTENCAO", "INDISPONIVEL", "BAIXADO"]) },
          { key: "responsavelUserId", label: "Responsável pelo veículo", type: "select", options: pessoas }, { key: "departamentoNome", label: "Departamento" }, { key: "chassi", label: "Chassi" }, { key: "renavam", label: "Renavam" }, { key: "observacoes", label: "Observações", type: "textarea", full: true },
        ]}
        filters={[{ key: "status", label: "Situação", options: opts(["ATIVO", "EM_MANUTENCAO", "INDISPONIVEL", "BAIXADO"]) }, { key: "tipo", label: "Tipo", options: opts(["CARRO", "VAN", "ONIBUS", "MICROONIBUS", "UTILITARIO", "MOTO", "CAMINHAO"]) }]}
        columns={[
          { label: "Veículo", primary: true, render: (v) => <><b>{v.placa}</b> {v.apelido || ""}<Typography variant="caption" component="div" color="text.secondary">{v.marca} {v.modelo}{v.ano ? ` · ${v.ano}` : ""}</Typography></> },
          { label: "Tipo", hideOnMobile: true, render: (v) => label(v.tipo) }, { label: "Odômetro", render: (v) => `${Number(v.odometroKm).toLocaleString("pt-BR")} km` }, { label: "Responsável", render: (v) => v.responsavelNome || "—" }, { label: "Situação", render: (v) => <Status value={v.status} /> },
        ]} />) },
    { k: "motoristas", l: "Motoristas", el: (
      <ResourceTab title="Motoristas" path="/frota/motoristas" newLabel="Novo motorista" refreshKey={rev} canCreate={gestor} editable={gestor}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>O número da CNH é guardado cifrado; apenas os 3 últimos dígitos aparecem na tela (LGPD).</Alert>}
        fields={[
          { key: "nome", label: "Nome", required: true, full: true }, { key: "userId", label: "Usuário do sistema", type: "select", options: pessoas }, { key: "colaboradorId", label: "ID do colaborador no RH (opcional)" },
          { key: "cnhNumero", label: "Nº da CNH (somente dígitos)", helper: "Deixe vazio para manter o atual." }, { key: "cnhCategoria", label: "Categoria", type: "select", options: opts(["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"]) },
          { key: "cnhValidade", label: "Validade da CNH", type: "date" }, { key: "telefone", label: "Telefone" }, { key: "ativo", label: "Ativo", type: "bool" },
        ]} defaults={{ ativo: true }}
        columns={[
          { label: "Motorista", primary: true, render: (m) => m.nome }, { label: "CNH", render: (m) => `${m.cnhMascarada || "—"} ${m.cnhCategoria || ""}` },
          { label: "Validade", render: (m) => <><span>{fmtDate(m.cnhValidade)} </span><AlertaChip alerta={m.cnhAlerta} /></> }, { label: "Situação", render: (m) => <Status value={m.ativo ? "ATIVO" : "INATIVO"} /> },
        ]} />) },
    { k: "registros", l: "Km e abastecimento", el: (
      <ResourceTab title="Quilometragem e abastecimento" path="/frota/registros" newLabel="Novo registro" refreshKey={rev} editable={false}
        fields={[V, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["ABASTECIMENTO", "QUILOMETRAGEM"]) }, { key: "km", label: "Km no odômetro", type: "number", required: true }, { key: "data", label: "Data", type: "datetime" },
          { key: "litros", label: "Litros", type: "number", hidden: (v) => v.tipo !== "ABASTECIMENTO" }, { key: "valor", label: "Valor (R$)", type: "number", hidden: (v) => v.tipo !== "ABASTECIMENTO" },
          { key: "combustivel", label: "Combustível", type: "select", options: opts(COMB), hidden: (v) => v.tipo !== "ABASTECIMENTO" }, { key: "posto", label: "Posto", hidden: (v) => v.tipo !== "ABASTECIMENTO" },
          { key: "motoristaId", label: "Motorista", type: "select", options: motoristas }, { key: "observacoes", label: "Observações", type: "textarea", full: true }]}
        filters={[filtroV, { key: "tipo", label: "Tipo", options: opts(["ABASTECIMENTO", "QUILOMETRAGEM"]) }]}
        columns={[
          { label: "Veículo", primary: true, render: (r) => vNome[r.veiculoId] || "—" }, { label: "Tipo", render: (r) => label(r.tipo) }, { label: "Data", render: (r) => fmtDT(r.data) }, { label: "Km", render: (r) => Number(r.km).toLocaleString("pt-BR") },
          { label: "Litros", hideOnMobile: true, render: (r) => r.litros ?? "—" }, { label: "Valor", render: (r) => (r.valor != null ? fmtMoney(r.valor) : "—") }, { label: "Responsável", render: (r) => r.motoristaNome || r.registradoPorNome || "—" },
        ]} />) },
    { k: "multas", l: "Multas", el: (
      <ResourceTab title="Multas de trânsito" path="/frota/multas" newLabel="Registrar multa" anexoRef="Multa" refreshKey={rev} canCreate={gestor} editable={gestor}
        fields={[V, { key: "motoristaId", label: "Motorista condutor", type: "select", options: motoristas }, { key: "autoInfracao", label: "Auto de infração" }, { key: "dataInfracao", label: "Data da infração", type: "date", required: true },
          { key: "descricao", label: "Infração", required: true, full: true }, { key: "local", label: "Local" }, { key: "pontos", label: "Pontos", type: "number" }, { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "vencimento", label: "Vencimento", type: "date" }]}
        filters={[filtroV, { key: "status", label: "Situação", options: opts(["REGISTRADA", "EM_RECURSO", "PAGA", "CANCELADA"]) }, { key: "tratamento", label: "Tratamento", options: opts(["A_DEFINIR", "INSTITUICAO", "RESSARCIMENTO", "DESCONTO_FOLHA"]) }]}
        columns={[
          { label: "Multa", primary: true, render: (m) => <><b>{m.descricao}</b><Typography variant="caption" component="div" color="text.secondary">{vNome[m.veiculoId] || ""} · {m.autoInfracao || "s/ auto"} · {fmtDate(m.dataInfracao)}</Typography></> },
          { label: "Valor", render: (m) => fmtMoney(m.valor) }, { label: "Responsável", render: (m) => m.responsavelNome || "—" }, { label: "Tratamento", render: (m) => <>{label(m.tratamento)}{m.valorRessarcir ? ` (${fmtMoney(m.valorRessarcido)}/${fmtMoney(m.valorRessarcir)})` : ""}</> },
          { label: "Vence", hideOnMobile: true, render: (m) => fmtDate(m.vencimento) }, { label: "Situação", render: (m) => <Status value={m.status} /> },
        ]}
        rowActions={(m, { run }) => [
          { label: "Definir ressarcimento / desconto", show: gestor && !["PAGA", "CANCELADA"].includes(m.status), onClick: () => setDlg({ kind: "tratamento", row: m }) },
          { label: "Registrar valor ressarcido", show: gestor && ["RESSARCIMENTO", "DESCONTO_FOLHA"].includes(m.tratamento) && m.valorRessarcido < m.valorRessarcir, onClick: () => setDlg({ kind: "ressarcir", row: m }) },
          { label: "Marcar como paga", show: gestor && ["REGISTRADA", "EM_RECURSO"].includes(m.status), onClick: () => { void run(() => call("POST", `${J}/frota/multas/${m.id}/pagar`), "Multa paga."); } },
          { label: "Em recurso", show: gestor && m.status === "REGISTRADA", onClick: () => { void run(() => call("POST", `${J}/frota/multas/${m.id}/recurso`), "Marcada em recurso."); } },
          { label: "Cancelar multa", color: "error", show: gestor && !["PAGA", "CANCELADA"].includes(m.status), onClick: () => { void run(() => call("POST", `${J}/frota/multas/${m.id}/cancelar`, {}), "Multa cancelada.", "Cancelar esta multa?"); } },
        ]} />) },
    { k: "seguros", l: "Seguros", el: (
      <ResourceTab title="Seguros (apólices)" path="/frota/seguros" newLabel="Nova apólice" anexoRef="Seguro" refreshKey={rev} canCreate={gestor} editable={false}
        fields={[V, { key: "apolice", label: "Apólice", required: true }, { key: "seguradora", label: "Seguradora", required: true }, { key: "vigenciaInicio", label: "Início", type: "date", required: true }, { key: "vigenciaFim", label: "Fim", type: "date", required: true },
          { key: "premio", label: "Prêmio (R$)", type: "number" }, { key: "franquia", label: "Franquia (R$)", type: "number" }, { key: "corretor", label: "Corretor" }, { key: "responsavelNome", label: "Responsável interno" }, { key: "cobertura", label: "Coberturas", type: "textarea", full: true }]}
        filters={[filtroV]}
        columns={[
          { label: "Apólice", primary: true, render: (s) => <><b>{s.apolice}</b><Typography variant="caption" component="div" color="text.secondary">{s.seguradora} · {vNome[s.veiculoId] || ""}</Typography></> },
          { label: "Vigência até", render: (s) => fmtDate(s.vigenciaFim) }, { label: "Prazo", render: (s) => (s.status === "VIGENTE" ? <AlertaChip alerta={diasDe(s.vigenciaFim)} /> : "—") }, { label: "Prêmio", render: (s) => fmtMoney(s.premio) }, { label: "Responsável", hideOnMobile: true, render: (s) => s.responsavelNome || "—" }, { label: "Situação", render: (s) => <Status value={s.status} /> },
        ]} />) },
    { k: "manutencoes", l: "Manutenções e revisões", el: (
      <ResourceTab title="Manutenções e revisões da frota" path="/frota/manutencoes" newLabel="Nova manutenção" anexoRef="FrotaManutencao" refreshKey={rev} canCreate={gestor} editable={false}
        fields={[V, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["REVISAO", "PREVENTIVA", "CORRETIVA", "PNEUS", "LAVAGEM", "FUNILARIA"]) }, { key: "descricao", label: "Descrição", required: true, full: true }, { key: "data", label: "Data", type: "date", required: true },
          { key: "km", label: "Km", type: "number" }, { key: "custo", label: "Custo (R$)", type: "number" }, { key: "oficina", label: "Oficina" }, { key: "responsavelUserId", label: "Responsável", type: "select", options: pessoas },
          { key: "proximaData", label: "Próxima revisão (data)", type: "date" }, { key: "proximaKm", label: "Próxima revisão (km)", type: "number" }, { key: "status", label: "Situação", type: "select", options: opts(["AGENDADA", "CONCLUIDA", "CANCELADA"]) }]}
        filters={[filtroV, { key: "tipo", label: "Tipo", options: opts(["REVISAO", "PREVENTIVA", "CORRETIVA", "PNEUS", "LAVAGEM", "FUNILARIA"]) }]}
        columns={[
          { label: "Serviço", primary: true, render: (m) => <><b>{m.descricao}</b><Typography variant="caption" component="div" color="text.secondary">{vNome[m.veiculoId] || ""} · {label(m.tipo)}</Typography></> },
          { label: "Data", render: (m) => fmtDate(m.data) }, { label: "Custo", render: (m) => fmtMoney(m.custo) }, { label: "Responsável", render: (m) => m.responsavelNome || "—" }, { label: "Próxima", hideOnMobile: true, render: (m) => (m.proximaData ? fmtDate(m.proximaData) : m.proximaKm ? `${m.proximaKm} km` : "—") },
        ]} />) },
    { k: "documentos", l: "Documentos", el: (
      <ResourceTab title="Documentos dos veículos (CRLV, licenciamento, IPVA…)" path="/frota/documentos" newLabel="Novo documento" anexoRef="FrotaDoc" refreshKey={rev} canCreate={gestor} editable={false}
        fields={[V, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["CRLV", "LICENCIAMENTO", "IPVA", "DPVAT", "VISTORIA", "AUTORIZACAO", "OUTRO"]) }, { key: "numero", label: "Número" }, { key: "exercicio", label: "Exercício", type: "number" },
          { key: "emissao", label: "Emissão", type: "date" }, { key: "validade", label: "Validade", type: "date" }, { key: "valor", label: "Valor (R$)", type: "number" }, { key: "responsavelNome", label: "Responsável" }]}
        filters={[filtroV, { key: "tipo", label: "Tipo", options: opts(["CRLV", "LICENCIAMENTO", "IPVA", "DPVAT", "VISTORIA", "AUTORIZACAO", "OUTRO"]) }]}
        columns={[
          { label: "Documento", primary: true, render: (d) => <><b>{d.tipo}{d.exercicio ? ` ${d.exercicio}` : ""}</b><Typography variant="caption" component="div" color="text.secondary">{vNome[d.veiculoId] || ""} {d.numero || ""}</Typography></> },
          { label: "Validade", render: (d) => fmtDate(d.validade) }, { label: "Prazo", render: (d) => <AlertaChip alerta={diasDe(d.validade)} /> }, { label: "Responsável", hideOnMobile: true, render: (d) => d.responsavelNome || "—" },
        ]} />) },
    { k: "reservas", l: "Reservas e viagens", el: (
      <ResourceTab title="Reservas e viagens" path="/frota/reservas" newLabel="Nova reserva" anexoRef="Reserva" refreshKey={rev} editable={false} fields={RESERVA_FIELDS(veiculos, motoristas)}
        filters={[filtroV, { key: "status", label: "Situação", options: opts(["SOLICITADA", "APROVADA", "EM_CURSO", "CONCLUIDA", "NEGADA", "CANCELADA"]) }]}
        columns={[
          { label: "Viagem", primary: true, render: (r) => <><b>{r.destino}</b><Typography variant="caption" component="div" color="text.secondary">{r.numero} · {vNome[r.veiculoId] || ""} · {r.finalidade}</Typography></> },
          { label: "Solicitante", render: (r) => r.solicitanteNome || "—" }, { label: "Motorista", render: (r) => r.motoristaNome || "—" }, { label: "Saída", render: (r) => fmtDT(r.saidaPrevista) }, { label: "Km", hideOnMobile: true, render: (r) => (r.kmChegada != null ? `${r.kmSaida}→${r.kmChegada}` : "—") }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r, { run }) => [
          { label: "Aprovar", show: gestor && r.status === "SOLICITADA", onClick: () => setDlg({ kind: "aprovar", row: r }) },
          { label: "Negar", color: "error", show: gestor && r.status === "SOLICITADA", onClick: () => setDlg({ kind: "negar", row: r }) },
          { label: "Iniciar viagem (saída)", show: gestor && r.status === "APROVADA", onClick: () => { void run(() => call("POST", `${J}/frota/reservas/${r.id}/iniciar`, {}), "Viagem iniciada."); } },
          { label: "Concluir viagem (chegada)", show: gestor && r.status === "EM_CURSO", onClick: () => setDlg({ kind: "concluir", row: r }) },
          { label: "Cancelar", color: "error", show: ["SOLICITADA", "APROVADA"].includes(r.status), onClick: () => { void run(() => call("POST", `${J}/frota/reservas/${r.id}/cancelar`), "Reserva cancelada.", "Cancelar a reserva?"); } },
        ]} />) },
  ];
  const t = telas[Math.min(sub, telas.length - 1)];
  const R = dlg?.row;
  const fin = async (path: string, body: any) => { await call("POST", `${J}${path}`, body); setDlg(null); bump(); };
  return (
    <>
      <Tabs value={Math.min(sub, telas.length - 1)} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{telas.map((x) => <Tab key={x.k} label={x.l} sx={{ textTransform: "none", fontWeight: 700 }} />)}</Tabs>
      <Box key={t.k + rev}>{t.el}</Box>
      <FormDialog open={dlg?.kind === "tratamento"} title="Ressarcimento / desconto da multa" onClose={() => setDlg(null)} maxWidth="sm"
        fields={[{ key: "tratamento", label: "Tratamento", type: "select", required: true, options: opts(["INSTITUICAO", "RESSARCIMENTO", "DESCONTO_FOLHA"]) }, { key: "responsavelUserId", label: "Responsável pelo ressarcimento", type: "select", options: pessoas }, { key: "responsavelNome", label: "…ou nome (externo)" }, { key: "valorRessarcir", label: "Valor a ressarcir (R$)", type: "number", helper: "Vazio = valor total da multa." }]}
        onSubmit={(b) => fin(`/frota/multas/${R.id}/tratamento`, b)} />
      <FormDialog open={dlg?.kind === "ressarcir"} title="Registrar valor ressarcido" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "valor", label: "Valor (R$)", type: "number", required: true }]} onSubmit={(b) => fin(`/frota/multas/${R.id}/ressarcir`, b)} />
      <FormDialog open={dlg?.kind === "aprovar"} title="Aprovar reserva" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "motoristaId", label: "Motorista", type: "select", required: true, options: motoristas }]} onSubmit={(b) => fin(`/frota/reservas/${R.id}/decidir`, { decisao: "APROVAR", ...b })} />
      <FormDialog open={dlg?.kind === "negar"} title="Negar reserva" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true, full: true }]} onSubmit={(b) => fin(`/frota/reservas/${R.id}/decidir`, { decisao: "NEGAR", ...b })} />
      <FormDialog open={dlg?.kind === "concluir"} title="Concluir viagem" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "kmChegada", label: "Km na chegada", type: "number", required: true }, { key: "ocorrencias", label: "Ocorrências", type: "textarea", full: true }]} onSubmit={(b) => fin(`/frota/reservas/${R.id}/concluir`, b)} />
    </>
  );
}

function diasDe(v: any) {
  if (!v) return null;
  const dias = Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000);
  return { dias, faixa: dias < 0 ? "VENCIDO" : dias <= 30 ? "D30" : dias <= 60 ? "D60" : dias <= 90 ? "D90" : "OK" };
}

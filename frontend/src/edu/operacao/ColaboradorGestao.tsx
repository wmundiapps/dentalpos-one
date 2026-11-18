import { Alert, Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, useLoad, useToast } from "../admissoes/common";
import { FormDialog, Pill, dt } from "./ui";

const TIPOS: Array<[string, string]> = [["DECLARACAO", "Declaração (modelo)"], ["POP", "POP — Procedimento Operacional Padrão"], ["INSTRUCAO", "Instrução de trabalho"], ["MANUAL", "Manual de serviço"], ["TREINAMENTO", "Treinamento"], ["REGRA", "Regra do serviço/setor"]];

/** RH/administração: biblioteca do colaborador, catálogo e entrega de EPIs, e a cadeia de escalonamento por demanda. */
export default function ColaboradorGestao() {
  const { data, loading, error, reload } = useLoad<any>("/colaborador/painel");
  const colabs = useLoad<any[]>("/colaborador/colaboradores");
  const { setMsg, node } = useToast();
  const [dlg, setDlg] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); setMsg({ type: "success", text: ok }); setDlg(null); reload(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } };
  const opcColab: Array<[string, string]> = (colabs.data ?? []).map((c: any) => [c.id, `${c.nome} (${c.matricula})`]);
  const opcEpi: Array<[string, string]> = (data?.epis ?? []).map((e: any) => [e.id, e.nome]);
  return (
    <StateBox loading={loading} error={error} onRetry={reload}>
      {data && (
        <>
          <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
            <Stat label="Colaboradores ativos" value={data.colaboradoresAtivos} />
            <Stat label="Documentos publicados" value={data.documentos.filter((d: any) => d.ativo).length} />
            <Stat label="EPIs aguardando retirada" value={data.entregas.filter((e: any) => e.status === "PENDENTE").length} color="#B45309" />
            <Stat label="Declarações emitidas" value={data.declaracoesEmitidas} />
          </Stack>
          <Section title="Biblioteca do colaborador" description="Declarações (modelos com {{nome}}, {{cargo}}, {{matricula}}, {{admissao}}, {{departamento}}, {{data}}), POPs, instruções, manuais, treinamentos e regras." actions={<Button variant="contained" onClick={() => setDlg("doc")}>Novo documento</Button>}>
            <Table size="small"><TableHead><TableRow><TableCell>Tipo</TableCell><TableCell>Título</TableCell><TableCell>Obrigatório</TableCell><TableCell>Ciências</TableCell><TableCell>Versão</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{data.documentos.filter((d: any) => d.ativo).map((d: any) => (
                <TableRow key={d.id}><TableCell>{TIPOS.find((t) => t[0] === d.tipo)?.[1] ?? d.tipo}</TableCell><TableCell>{d.titulo}</TableCell><TableCell>{d.obrigatorio ? "Sim" : "Não"}</TableCell><TableCell>{d.cientes}/{data.colaboradoresAtivos}</TableCell><TableCell>v{d.versao}</TableCell>
                  <TableCell><Button size="small" color="error" onClick={() => run(() => eduApi.del(`/colaborador/documentos/${d.id}`), "Documento removido.")}>Remover</Button></TableCell></TableRow>))}</TableBody></Table>
          </Section>
          <Section title="EPIs" description="Catálogo, entrega e controle de quem ainda não retirou." actions={<Stack direction="row" gap={1}><Button variant="outlined" onClick={() => setDlg("epi")}>Novo EPI</Button><Button variant="contained" onClick={() => setDlg("entrega")} disabled={!opcEpi.length}>Designar EPI a colaborador</Button></Stack>}>
            <Table size="small"><TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>EPI</TableCell><TableCell>Situação</TableCell><TableCell>Entrega</TableCell><TableCell>Ciente</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{data.entregas.map((e: any) => (
                <TableRow key={e.id}><TableCell>{e.colaborador}</TableCell><TableCell>{e.epi}{e.tamanho ? ` (${e.tamanho})` : ""}</TableCell><TableCell><Pill v={e.status} /></TableCell><TableCell>{dt(e.entregueEm)}</TableCell><TableCell>{e.cienteEm ? dt(e.cienteEm) : "—"}</TableCell>
                  <TableCell>{e.status === "PENDENTE" && <Button size="small" onClick={() => run(() => eduApi.post(`/colaborador/epis/entregas/${e.id}/entregar`, {}), "Entrega registrada.")}>Registrar entrega</Button>}</TableCell></TableRow>))}</TableBody></Table>
            {!data.entregas.length && <Alert severity="info" sx={{ mt: 1 }}>Nenhuma entrega registrada ainda.</Alert>}
          </Section>
          <Section title="A quem se reportar por demanda" description="Cadeia de escalonamento exibida no portal de cada colaborador." actions={<Button variant="contained" onClick={() => setDlg("esc")}>Nova regra</Button>}>
            {data.escalonamento.map((e: any) => (<Stack key={e.id} direction="row" gap={1} alignItems="center" sx={{ py: .5 }}><Typography sx={{ flex: 1 }}><b>{e.demanda}</b> — {e.nivel}º: {e.responsavel}{e.contato ? ` (${e.contato})` : ""}</Typography><Button size="small" color="error" onClick={() => run(() => eduApi.del(`/colaborador/escalonamento/${e.id}`), "Removido.")}>Remover</Button></Stack>))}
          </Section>
        </>
      )}
      <FormDialog open={dlg === "doc"} title="Novo documento" onClose={() => setDlg(null)} campos={[{ k: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { k: "titulo", label: "Título", required: true }, { k: "descricao", label: "Resumo" }, { k: "conteudo", label: "Texto / modelo", multiline: true }, { k: "url", label: "Link do material (opcional)" }, { k: "duracaoHoras", label: "Duração (h) — treinamento", type: "number" }, { k: "prazoDias", label: "Prazo para ciência (dias)", type: "number" }, { k: "obrigatorio", label: "Obrigatório?", type: "select", options: [["", "Não"], ["true", "Sim"]] }]}
        onSave={(v) => run(() => eduApi.post("/colaborador/documentos", { ...v, obrigatorio: v.obrigatorio === "true" }), "Documento publicado.")} />
      <FormDialog open={dlg === "epi"} title="Novo EPI" onClose={() => setDlg(null)} campos={[{ k: "nome", label: "Nome", required: true }, { k: "ca", label: "Nº do CA" }, { k: "categoria", label: "Categoria" }, { k: "validadeDias", label: "Troca a cada (dias)", type: "number" }]} onSave={(v) => run(() => eduApi.post("/colaborador/epis", v), "EPI cadastrado.")} />
      <FormDialog open={dlg === "entrega"} title="Designar EPI" onClose={() => setDlg(null)} campos={[{ k: "colaboradorId", label: "Colaborador", type: "select", options: opcColab, required: true }, { k: "epiId", label: "EPI", type: "select", options: opcEpi, required: true }, { k: "tamanho", label: "Tamanho" }]} onSave={(v) => run(() => eduApi.post("/colaborador/epis/entregas", v), "EPI designado (aparece como pendente até a entrega).")} />
      <FormDialog open={dlg === "esc"} title="Regra de escalonamento" onClose={() => setDlg(null)} campos={[{ k: "demanda", label: "Demanda (ex.: Acidente, falta de material)", required: true }, { k: "nivel", label: "Nível (1 = primeiro a procurar)", type: "number" }, { k: "responsavel", label: "Responsável", required: true }, { k: "cargo", label: "Cargo" }, { k: "contato", label: "Contato / ramal" }]} onSave={(v) => run(() => eduApi.post("/colaborador/escalonamento", v), "Regra criada.")} />
      <Box>{node}</Box>
    </StateBox>
  );
}

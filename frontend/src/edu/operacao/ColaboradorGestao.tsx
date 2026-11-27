import { Alert, Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, useLoad, useToast } from "../admissoes/common";
import { FormDialog, Pill, dt } from "./ui";

const TIPOS: Array<[string, string]> = [["DECLARACAO", "Declaração (modelo)"], ["POP", "POP — Procedimento Operacional Padrão"], ["INSTRUCAO", "Instrução de trabalho"], ["MANUAL", "Manual de serviço"], ["TREINAMENTO", "Treinamento"], ["REGRA", "Regra do serviço/setor"]];

function imprimirDocumento(d: any, nomeTipo: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${d.titulo}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;max-width:720px;margin:0 auto}h1{font-size:20px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px}</style></head>
    <body><p style="color:#666;font-size:12px">${nomeTipo} · v${d.versao} · ${d.obrigatorio ? "Ciência obrigatória" : "Informativo"}</p>
    <h1>${d.titulo}</h1>${d.descricao ? `<p>${d.descricao}</p>` : ""}<pre>${d.conteudo || ""}</pre></body></html>`);
  w.document.close(); w.focus(); w.print();
}

async function enviarDocumento(d: any) {
  const destino = window.prompt("E-mail de destino para enviar este documento:");
  if (!destino?.trim()) return null;
  await eduApi.post("/comunicacao/outbox", {
    canal: "EMAIL", destino: destino.trim(), assunto: d.titulo,
    mensagem: `${d.descricao ? d.descricao + "\n\n" : ""}${d.conteudo || ""}`,
  });
  return destino;
}

/** RH/administração: biblioteca do colaborador, catálogo e entrega de EPIs, e a cadeia de escalonamento por demanda. */
export default function ColaboradorGestao() {
  const { data, loading, error, reload } = useLoad<any>("/colaborador/painel");
  const colabs = useLoad<any[]>("/colaborador/colaboradores");
  const deptos = useLoad<any>("/rh/departamentos?pageSize=100");
  const { setMsg, node } = useToast();
  const [dlg, setDlg] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<any | null>(null);
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); setMsg({ type: "success", text: ok }); setDlg(null); reload(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } };
  const opcColab: Array<[string, string]> = (colabs.data ?? []).map((c: any) => [c.id, `${c.nome} (${c.matricula})`]);
  const opcEpi: Array<[string, string]> = (data?.epis ?? []).map((e: any) => [e.id, e.nome]);
  const opcDepto: Array<[string, string]> = [["", "Todos os setores"] as [string, string], ...((deptos.data?.items ?? []).map((d: any): [string, string] => [d.id, d.nome]))];
  const docFields = [
    { k: "tipo", label: "Tipo", type: "select" as const, options: TIPOS, required: true },
    { k: "titulo", label: "Título", required: true },
    { k: "departamentoId", label: "Setor", type: "select" as const, options: opcDepto },
    { k: "descricao", label: "Resumo" },
    { k: "conteudo", label: "Texto / modelo", multiline: true },
    { k: "url", label: "Link do material (opcional)" },
    { k: "duracaoHoras", label: "Duração (h) — treinamento", type: "number" as const },
    { k: "prazoDias", label: "Prazo para ciência (dias)", type: "number" as const },
    { k: "obrigatorio", label: "Obrigatório?", type: "select" as const, options: [["", "Não"], ["true", "Sim"]] as [string, string][] },
  ];
  return (
    <StateBox loading={loading} error={error} onRetry={reload}>
      {data && (
        <>
          <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 3, flexWrap: "wrap" }}>
            <Stat label="Colaboradores ativos" value={data.colaboradoresAtivos} />
            <Stat label="Documentos publicados" value={data.documentos.filter((d: any) => d.ativo).length} />
            <Stat label="EPIs aguardando retirada" value={data.entregas.filter((e: any) => e.status === "PENDENTE").length} color="#B45309" />
            <Stat label="Declarações emitidas" value={data.declaracoesEmitidas} />
          </Stack>
          <Section title="Biblioteca do colaborador" description="Declarações (modelos com {{nome}}, {{cargo}}, {{matricula}}, {{admissao}}, {{departamento}}, {{data}}), POPs, instruções, manuais, treinamentos e regras." actions={<Button variant="contained" onClick={() => { setEditDoc(null); setDlg("doc"); }}>Novo documento</Button>}>
            <Table size="small"><TableHead><TableRow><TableCell>Tipo</TableCell><TableCell>Título</TableCell><TableCell>Setor</TableCell><TableCell>Obrigatório</TableCell><TableCell>Ciências</TableCell><TableCell>Versão</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{data.documentos.filter((d: any) => d.ativo).map((d: any) => (
                <TableRow key={d.id}><TableCell>{TIPOS.find((t) => t[0] === d.tipo)?.[1] ?? d.tipo}</TableCell><TableCell>{d.titulo}</TableCell>
                  <TableCell>{(deptos.data?.items ?? []).find((x: any) => x.id === d.departamentoId)?.nome ?? "Todos"}</TableCell>
                  <TableCell>{d.obrigatorio ? "Sim" : "Não"}</TableCell><TableCell>{d.cientes}/{data.colaboradoresAtivos}</TableCell><TableCell>v{d.versao}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Button size="small" onClick={() => { setEditDoc(d); setDlg("doc"); }}>Editar</Button>
                      <Button size="small" onClick={() => imprimirDocumento(d, TIPOS.find((t) => t[0] === d.tipo)?.[1] ?? d.tipo)}>Imprimir</Button>
                      <Button size="small" onClick={() => run(() => enviarDocumento(d), "Documento enviado.")}>Enviar</Button>
                      <Button size="small" color="error" onClick={() => run(() => eduApi.del(`/colaborador/documentos/${d.id}`), "Documento removido.")}>Remover</Button>
                    </Stack>
                  </TableCell></TableRow>))}</TableBody></Table>
          </Section>
          <Section title="EPIs" description="Catálogo, entrega e controle de quem ainda não retirou." actions={<Stack direction="row" spacing={1} useFlexGap><Button variant="outlined" onClick={() => setDlg("epi")}>Novo EPI</Button><Button variant="contained" onClick={() => setDlg("entrega")} disabled={!opcEpi.length}>Designar EPI a colaborador</Button></Stack>}>
            <Table size="small"><TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>EPI</TableCell><TableCell>Situação</TableCell><TableCell>Entrega</TableCell><TableCell>Ciente</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{data.entregas.map((e: any) => (
                <TableRow key={e.id}><TableCell>{e.colaborador}</TableCell><TableCell>{e.epi}{e.tamanho ? ` (${e.tamanho})` : ""}</TableCell><TableCell><Pill v={e.status} /></TableCell><TableCell>{dt(e.entregueEm)}</TableCell><TableCell>{e.cienteEm ? dt(e.cienteEm) : "—"}</TableCell>
                  <TableCell>{e.status === "PENDENTE" && <Button size="small" onClick={() => run(() => eduApi.post(`/colaborador/epis/entregas/${e.id}/entregar`, {}), "Entrega registrada.")}>Registrar entrega</Button>}</TableCell></TableRow>))}</TableBody></Table>
            {!data.entregas.length && <Alert severity="info" sx={{ mt: 1 }}>Nenhuma entrega registrada ainda.</Alert>}
          </Section>
          <Section title="A quem se reportar por demanda" description="Cadeia de escalonamento exibida no portal de cada colaborador." actions={<Button variant="contained" onClick={() => setDlg("esc")}>Nova regra</Button>}>
            {data.escalonamento.map((e: any) => (<Stack key={e.id} direction="row" spacing={1} useFlexGap sx={{ py: .5, alignItems: "center" }}><Typography sx={{ flex: 1 }}><b>{e.demanda}</b> — {e.nivel}º: {e.responsavel}{e.contato ? ` (${e.contato})` : ""}</Typography><Button size="small" color="error" onClick={() => run(() => eduApi.del(`/colaborador/escalonamento/${e.id}`), "Removido.")}>Remover</Button></Stack>))}
          </Section>
        </>
      )}
      <FormDialog open={dlg === "doc"} title={editDoc ? "Editar documento" : "Novo documento"} texto={editDoc ? "Salvar" : "Publicar"} inicial={editDoc ? { ...editDoc, obrigatorio: editDoc.obrigatorio ? "true" : "" } : undefined}
        onClose={() => setDlg(null)} campos={docFields}
        onSave={(v) => run(() => editDoc ? eduApi.patch(`/colaborador/documentos/${editDoc.id}`, { ...v, obrigatorio: v.obrigatorio === "true" }) : eduApi.post("/colaborador/documentos", { ...v, obrigatorio: v.obrigatorio === "true" }), editDoc ? "Documento atualizado." : "Documento publicado.")} />
      <FormDialog open={dlg === "epi"} title="Novo EPI" onClose={() => setDlg(null)} campos={[{ k: "nome", label: "Nome", required: true }, { k: "ca", label: "Nº do CA" }, { k: "categoria", label: "Categoria" }, { k: "validadeDias", label: "Troca a cada (dias)", type: "number" }]} onSave={(v) => run(() => eduApi.post("/colaborador/epis", v), "EPI cadastrado.")} />
      <FormDialog open={dlg === "entrega"} title="Designar EPI" onClose={() => setDlg(null)} campos={[{ k: "colaboradorId", label: "Colaborador", type: "select", options: opcColab, required: true }, { k: "epiId", label: "EPI", type: "select", options: opcEpi, required: true }, { k: "tamanho", label: "Tamanho" }]} onSave={(v) => run(() => eduApi.post("/colaborador/epis/entregas", v), "EPI designado (aparece como pendente até a entrega).")} />
      <FormDialog open={dlg === "esc"} title="Regra de escalonamento" onClose={() => setDlg(null)} campos={[{ k: "demanda", label: "Demanda (ex.: Acidente, falta de material)", required: true }, { k: "nivel", label: "Nível (1 = primeiro a procurar)", type: "number" }, { k: "responsavel", label: "Responsável", required: true }, { k: "cargo", label: "Cargo" }, { k: "contato", label: "Contato / ramal" }]} onSave={(v) => run(() => eduApi.post("/colaborador/escalonamento", v), "Regra criada.")} />
      <Box>{node}</Box>
    </StateBox>
  );
}

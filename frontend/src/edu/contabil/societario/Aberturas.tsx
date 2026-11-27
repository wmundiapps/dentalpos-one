import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, TextField, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useState } from "react";
import { AvisoSimulacao, Estado, Formulario, Kpi, KpiRow, Lista, SOC, Secao, StatusChip, TextoImprimivel, brl, dataBr, host, rotulo, useApi, useRun, useToast } from "../comum2/kit";
import { BuscaCnae, CnaeChips, type CnaeItem } from "./Cnaes";
import AlvarasLista from "./Alvaras";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
interface Socio { nome: string; cpf: string; participacao: number; administrador: boolean; proLabore?: number }

/** Assistente passo a passo de abertura (tipo, sócios, capital, endereço, objeto e CNAEs). */
function Assistente({ aberto, onClose, onCriada }: { aberto: boolean; onClose: () => void; onCriada: (id: string) => void }) {
  const meta = useApi<any>(aberto ? `${SOC}/meta` : null);
  const [passo, setPasso] = useState(0);
  const [tipo, setTipo] = useState("LTDA");
  const [nome, setNome] = useState(""); const [fantasia, setFantasia] = useState("");
  const [capital, setCapital] = useState("10000");
  const [socios, setSocios] = useState<Socio[]>([{ nome: "", cpf: "", participacao: 100, administrador: true }]);
  const [end, setEnd] = useState<Record<string, string>>({ tipoImovel: "COMERCIAL" });
  const [objeto, setObjeto] = useState("");
  const [principal, setPrincipal] = useState<CnaeItem | null>(null);
  const [secundarios, setSecundarios] = useState<CnaeItem[]>([]);
  const [erro, setErro] = useState<string | null>(null); const [salvando, setSalvando] = useState(false);
  const info = (meta.data?.tipos || []).find((t: any) => t.tipo === tipo);
  const unico = tipo === "MEI" || tipo === "EI" || tipo === "SLU";
  const NOMES = ["Tipo e nome", "Sócios e capital", "Endereço e objeto", "Atividades (CNAE)", "Revisão"];
  const valido = [nome.trim().length >= 3, socios.length >= (info?.minSocios || 1) && socios.every((s) => s.nome.trim().length >= 3), !!end.municipio && !!end.uf, !!principal, true][passo];
  const setSocio = (i: number, p: Partial<Socio>) => setSocios(socios.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const mudaTipo = (t: string) => { setTipo(t); const u = t === "MEI" || t === "EI" || t === "SLU"; if (u) setSocios([{ ...(socios[0] || { nome: "", cpf: "" }), participacao: 100, administrador: true } as Socio]); if (t === "MEI") setCapital("0"); };

  async function criar() {
    setSalvando(true); setErro(null);
    try {
      const body = {
        nomeEmpresarial: nome.trim(), nomeFantasia: fantasia.trim() || undefined, tipo, capitalSocial: tipo === "MEI" ? 0 : Number(capital) || 0, objetoSocial: objeto.trim() || undefined,
        endereco: { ...end, uf: end.uf?.toUpperCase() }, municipio: end.municipio, uf: end.uf?.toUpperCase(), cnaePrincipal: principal!.codigo, cnaesSecundarios: secundarios.map((c) => c.codigo),
        socios: socios.map((s) => ({ nome: s.nome.trim(), cpf: s.cpf.replace(/\D/g, "") || undefined, participacao: Number(s.participacao) || 0, administrador: s.administrador, proLabore: s.proLabore ? Number(s.proLabore) : undefined })),
      };
      const r: any = await host.post(`${SOC}/aberturas`, body);
      onCriada(r.id);
    } catch (e: any) { setErro(e?.message || "Falha ao criar a abertura."); } finally { setSalvando(false); }
  }

  return (
    <Dialog open={aberto} onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>Nova abertura de empresa — passo {passo + 1} de {NOMES.length}: {NOMES[passo]}</DialogTitle>
      <LinearProgress variant="determinate" value={((passo + 1) / NOMES.length) * 100} />
      <DialogContent dividers>
        <AvisoSimulacao texto="A consulta de viabilidade, o protocolo na Junta, o CNPJ e as inscrições são SIMULADOS: nenhum órgão real é acionado." />
        {erro ? <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert> : null}
        {passo === 0 && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <TextField select size="small" label="Tipo societário" value={tipo} onChange={(e) => mudaTipo(e.target.value)}>
              {(meta.data?.tipos || []).map((t: any) => <MenuItem key={t.tipo} value={t.tipo}>{t.nome}</MenuItem>)}
            </TextField>
            {info ? <Alert severity="info"><b>{info.resumo}</b><br />Registro: {info.registro}.</Alert> : null}
            <TextField size="small" required label="Nome empresarial" value={nome} onChange={(e) => setNome(e.target.value)} helperText={tipo === "LTDA" || tipo === "SLU" ? "Deve terminar com LTDA ou Limitada" : tipo === "SA" ? "Deve incluir S.A. ou Companhia" : "Normalmente o nome civil do titular"} />
            <TextField size="small" label="Nome fantasia (opcional)" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
          </Box>
        )}
        {passo === 1 && (
          <Box sx={{ display: "grid", gap: 2 }}>
            {tipo !== "MEI" ? <TextField size="small" type="number" label="Capital social (R$)" value={capital} onChange={(e) => setCapital(e.target.value)} /> : <Alert severity="info">MEI não possui capital social registrado.</Alert>}
            {socios.map((s, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: "grid", gap: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Typography sx={{ fontWeight: 700 }}>{unico ? "Titular" : `Sócio ${i + 1}`}</Typography>{!unico && socios.length > 1 ? <IconButton aria-label="Remover sócio" size="small" onClick={() => setSocios(socios.filter((_, k) => k !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton> : null}</Box>
                <TextField size="small" required label="Nome completo" value={s.nome} onChange={(e) => setSocio(i, { nome: e.target.value })} />
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <TextField size="small" label="CPF" value={s.cpf} onChange={(e) => setSocio(i, { cpf: e.target.value })} sx={{ flex: "1 1 160px" }} helperText="Dado pessoal: informe só o necessário (LGPD)" />
                  {!unico ? <TextField size="small" type="number" label="Participação (%)" value={s.participacao} onChange={(e) => setSocio(i, { participacao: Number(e.target.value) })} sx={{ flex: "1 1 120px" }} /> : null}
                  <TextField size="small" type="number" label="Pró-labore (R$)" value={s.proLabore ?? ""} onChange={(e) => setSocio(i, { proLabore: Number(e.target.value) })} sx={{ flex: "1 1 120px" }} />
                </Box>
                {!unico ? <FormControlLabel control={<Checkbox checked={s.administrador} onChange={(e) => setSocio(i, { administrador: e.target.checked })} />} label="Administrador" /> : null}
              </Paper>
            ))}
            {!unico ? <Button onClick={() => setSocios([...socios, { nome: "", cpf: "", participacao: 0, administrador: false }])}>Adicionar sócio</Button> : null}
            {!unico ? <Typography variant="caption" color={Math.round(socios.reduce((a, s) => a + (Number(s.participacao) || 0), 0) * 100) / 100 === 100 ? "text.secondary" : "error"}>Participações somam {socios.reduce((a, s) => a + (Number(s.participacao) || 0), 0)}% (precisam somar 100%).</Typography> : null}
          </Box>
        )}
        {passo === 2 && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <TextField size="small" label="CEP" value={end.cep || ""} onChange={(e) => setEnd({ ...end, cep: e.target.value })} sx={{ flex: "1 1 120px" }} />
              <TextField size="small" label="Logradouro" value={end.logradouro || ""} onChange={(e) => setEnd({ ...end, logradouro: e.target.value })} sx={{ flex: "3 1 220px" }} />
              <TextField size="small" label="Número" value={end.numero || ""} onChange={(e) => setEnd({ ...end, numero: e.target.value })} sx={{ flex: "1 1 90px" }} />
            </Box>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <TextField size="small" label="Bairro" value={end.bairro || ""} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} sx={{ flex: "1 1 160px" }} />
              <TextField size="small" required label="Município" value={end.municipio || ""} onChange={(e) => setEnd({ ...end, municipio: e.target.value })} sx={{ flex: "2 1 180px" }} />
              <TextField size="small" required select label="UF" value={end.uf || ""} onChange={(e) => setEnd({ ...end, uf: e.target.value })} sx={{ flex: "0 1 90px", minWidth: 90 }}>{UFS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}</TextField>
              <TextField size="small" select label="Tipo de imóvel" value={end.tipoImovel || "COMERCIAL"} onChange={(e) => setEnd({ ...end, tipoImovel: e.target.value })} sx={{ flex: "1 1 140px" }}>{["COMERCIAL", "RESIDENCIAL", "MISTO"].map((t) => <MenuItem key={t} value={t}>{rotulo(t)}</MenuItem>)}</TextField>
            </Box>
            <TextField size="small" multiline minRows={3} label="Objeto social (atividades que a empresa exercerá)" value={objeto} onChange={(e) => setObjeto(e.target.value)} />
          </Box>
        )}
        {passo === 3 && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Typography variant="body2">Principal: {principal ? <b>{principal.codigoFormatado} — {principal.descricao}</b> : <i>escolha abaixo</i>}</Typography>
            {principal ? <CnaeChips c={principal} /> : null}
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>{secundarios.map((c) => <Chip key={c.codigo} label={`${c.codigoFormatado}`} title={c.descricao} onDelete={() => setSecundarios(secundarios.filter((x) => x.codigo !== c.codigo))} />)}</Box>
            <BuscaCnae mei={tipo === "MEI"} rotuloAcao="Usar" onAdd={(c) => { if (!principal) setPrincipal(c); else if (c.codigo !== principal.codigo && !secundarios.some((x) => x.codigo === c.codigo)) setSecundarios([...secundarios, c]); }} />
            <Typography variant="caption" color="text.secondary">O primeiro CNAE escolhido vira o principal; os demais, secundários. {principal ? <Button size="small" onClick={() => { setPrincipal(null); setSecundarios([]); }}>Limpar escolha</Button> : null}</Typography>
          </Box>
        )}
        {passo === 4 && (
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography><b>{nome}</b> — {info?.nome}</Typography>
            <Typography variant="body2">Capital: {tipo === "MEI" ? "n/a" : brl(capital)} · {socios.length} {unico ? "titular" : "sócio(s)"} · {end.municipio}/{end.uf}</Typography>
            <Typography variant="body2">CNAE principal: {principal?.codigoFormatado} — {principal?.descricao}{secundarios.length ? ` (+${secundarios.length} secundário(s))` : ""}</Typography>
            <Alert severity="info">Ao criar, o sistema monta a linha do tempo com tarefas e responsáveis. Depois você roda a viabilidade (simulada), gera as minutas e acompanha CNPJ, inscrições e alvarás.</Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button disabled={passo === 0} onClick={() => setPasso(passo - 1)}>Voltar</Button>
        {passo < NOMES.length - 1 ? <Button variant="contained" disabled={!valido} onClick={() => setPasso(passo + 1)}>Avançar</Button> : <Button variant="contained" disabled={salvando} onClick={criar}>{salvando ? "Criando..." : "Criar abertura"}</Button>}
      </DialogActions>
    </Dialog>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const d = useApi<any>(`${SOC}/aberturas/${id}`);
  const meta = useApi<any>(`${SOC}/meta`);
  const { toast, node } = useToast();
  const run = useRun(toast, () => { d.reload(); onChanged(); });
  const [doc, setDoc] = useState<{ titulo: string; texto: string } | null>(null);
  const [novaTarefa, setNovaTarefa] = useState(false);
  const a = d.data;
  const abrirDoc = async (docId: string) => { try { const r: any = await host.get(`${SOC}/aberturas/${id}/documentos/${docId}`); setDoc({ titulo: r.titulo, texto: r.conteudo }); } catch (e: any) { toast({ type: "error", text: e.message }); } };
  const avancar = (pid: string) => run(() => host.post<any>(`${SOC}/protocolos/${pid}/avancar`, {}), "Protocolo atualizado (simulação).");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>{a?.nomeEmpresarial || "Abertura"} {a ? <StatusChip v={a.status} /> : null}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Estado loading={d.loading && !a} error={d.error} onRetry={d.reload}>
          {a ? (
            <>
              <AvisoSimulacao />
              <KpiRow>
                <Kpi titulo="Tipo" valor={a.tipo} dica={`${a.municipio || "—"}/${a.uf || "—"}`} />
                <Kpi titulo="Etapa atual" valor={rotulo(a.etapa)} />
                <Kpi titulo="CNPJ (simulado)" valor={a.cnpj || "—"} dica={a.cnpj ? "Fictício: não existe na Receita" : "ainda não emitido"} cor={a.cnpj ? "#c98a00" : undefined} />
                <Kpi titulo="Capital" valor={brl(a.capitalSocial)} />
              </KpiRow>
              <Secao titulo="Linha do tempo da abertura">
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  {a.linhaTempo.map((e: any) => (
                    <Paper key={e.etapa} variant="outlined" sx={{ p: 1, borderRadius: 2, minWidth: 130, flex: "1 1 130px", borderColor: e.status === "ATUAL" ? "primary.main" : undefined, borderWidth: e.status === "ATUAL" ? 2 : 1, opacity: e.status === "FUTURA" ? 0.65 : 1 }}>
                      <Typography variant="caption" color="text.secondary">{e.status === "ATUAL" ? "Em andamento" : e.status === "CONCLUIDA" || e.status === "PASSADA" ? "Concluída" : "A fazer"}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{e.nome}</Typography>
                      <Typography variant="caption">{e.concluidas}/{e.tarefas} tarefas{e.atrasadas ? ` · ${e.atrasadas} atrasada(s)` : ""}</Typography>
                    </Paper>
                  ))}
                </Box>
                <Lista linhas={a.tarefas} colunas={[
                  { titulo: "Tarefa", principal: true, render: (t: any) => t.titulo },
                  { titulo: "Etapa", render: (t: any) => meta.data?.etapas?.find((e: any) => e.etapa === t.etapa)?.nome || rotulo(t.etapa) },
                  { titulo: "Responsável", render: (t: any) => t.responsavelNome || "—" },
                  { titulo: "Prazo", render: (t: any) => <span style={{ color: t.status !== "CONCLUIDA" && t.prazo && new Date(t.prazo) < new Date() ? "#d64545" : undefined }}>{dataBr(t.prazo)}</span> },
                  { titulo: "Situação", render: (t: any) => <StatusChip v={t.status} /> },
                ]} acoes={(t: any) => (
                  <>
                    {t.status !== "CONCLUIDA" ? <Button size="small" onClick={() => run(() => host.put(`${SOC}/tarefas/${t.id}`, { status: "CONCLUIDA" }), "Tarefa concluída.")}>Concluir</Button> : <Button size="small" onClick={() => run(() => host.put(`${SOC}/tarefas/${t.id}`, { status: "PENDENTE" }), "Tarefa reaberta.")}>Reabrir</Button>}
                    <Button size="small" onClick={() => { const nome = window.prompt("Responsável pela tarefa:", t.responsavelNome || ""); if (nome) run(() => host.put(`${SOC}/tarefas/${t.id}`, { responsavelNome: nome }), "Responsável atualizado."); }}>Responsável</Button>
                  </>
                )} />
                <Button size="small" sx={{ mt: 1 }} onClick={() => setNovaTarefa(true)}>Nova tarefa</Button>
                <Formulario aberto={novaTarefa} titulo="Nova tarefa" aoFechar={() => setNovaTarefa(false)} campos={[
                  { nome: "etapa", rotulo: "Etapa", tipo: "select", obrigatorio: true, opcoes: (meta.data?.etapas || []).map((e: any) => ({ value: e.etapa, label: e.nome })), padrao: a.etapa },
                  { nome: "titulo", rotulo: "Tarefa", obrigatorio: true }, { nome: "responsavelNome", rotulo: "Responsável" }, { nome: "prazo", rotulo: "Prazo", tipo: "date" },
                ]} aoEnviar={async (v) => { await run(() => host.post(`${SOC}/aberturas/${id}/tarefas`, v), "Tarefa criada."); setNovaTarefa(false); }} />
              </Secao>
              <Secao titulo="Sócios" >
                <Lista linhas={a.socios} colunas={[
                  { titulo: "Nome", principal: true, render: (s: any) => s.nome }, { titulo: "Participação", render: (s: any) => `${s.participacao}%` },
                  { titulo: "Função", render: (s: any) => (s.administrador ? "Administrador" : "Sócio") }, { titulo: "CPF", render: (s: any) => (s.cpf ? `***.${s.cpf.slice(3, 6)}.${s.cpf.slice(6, 9)}-**` : "—") },
                ]} />
                <Typography variant="body2" sx={{ mt: 1 }}>Atividades: {a.cnaes.map((c: any) => `${c.codigoFormatado}${c.principal ? " (principal)" : ""}`).join(", ") || "—"}</Typography>
              </Secao>
              <Secao titulo="Viabilidade (simulada)" acoes={<Button variant="outlined" onClick={() => run(() => host.post<any>(`${SOC}/aberturas/${id}/viabilidade`, {}), "Viabilidade simulada executada.")}>Rodar checagem</Button>}>
                {a.viabilidade ? (
                  <>
                    <Box sx={{ mb: 1 }}><StatusChip v={a.viabilidade.resultado} /> <Typography component="span" variant="caption" color="text.secondary"> gerada em {new Date(a.viabilidade.geradoEm).toLocaleString("pt-BR")}</Typography></Box>
                    {a.viabilidade.itens.map((i: any, k: number) => <Alert key={k} severity={i.nivel === "ERRO" ? "error" : i.nivel === "ALERTA" ? "warning" : "success"} sx={{ py: 0, mb: 0.5 }}>{i.mensagem}</Alert>)}
                  </>
                ) : <Typography color="text.secondary">Ainda não executada.</Typography>}
              </Secao>
              <Secao titulo="Documentos (minutas imprimíveis)" acoes={<Button variant="outlined" onClick={() => run(() => host.post(`${SOC}/aberturas/${id}/documentos/gerar`, {}), "Documentos gerados.")}>Gerar documentos</Button>}>
                <Estado vazio={!a.documentos.length} textoVazio="Nenhum documento gerado ainda.">
                  <Lista linhas={a.documentos} colunas={[{ titulo: "Documento", principal: true, render: (x: any) => x.titulo }, { titulo: "Versão", render: (x: any) => `v${x.versao}` }, { titulo: "Gerado em", render: (x: any) => dataBr(x.createdAt) }]} acoes={(x: any) => <Button size="small" onClick={() => abrirDoc(x.id)}>Abrir / imprimir</Button>} />
                </Estado>
                <Typography variant="caption" color="text.secondary">Minutas sem validade jurídica: revise com contador/advogado antes de assinar.</Typography>
              </Secao>
              <Secao titulo="Registros e inscrições (CNPJ, Junta, IE, IM) — SIMULADOS" acoes={
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {["JUNTA", "CNPJ", "IM", "IE"].map((t) => <Button key={t} size="small" variant="outlined" onClick={() => run(() => host.post(`${SOC}/aberturas/${id}/protocolos`, { tipo: t }), `Protocolo ${t} aberto (simulação).`)}>Solicitar {t}</Button>)}
                </Box>}>
                <Estado vazio={!a.protocolos.length} textoVazio="Nenhum protocolo ainda.">
                  <Lista linhas={a.protocolos} colunas={[
                    { titulo: "Tipo", principal: true, render: (p: any) => `${rotulo(p.tipo)} — ${rotulo(p.orgao)}` }, { titulo: "Protocolo", render: (p: any) => p.protocolo },
                    { titulo: "Número emitido", render: (p: any) => p.numeroEmitido || "—" }, { titulo: "Status", render: (p: any) => <StatusChip v={p.status} /> }, { titulo: "Origem", render: (p: any) => <Chip size="small" variant="outlined" label={p.simulado ? "SIMULADO" : p.provedor} /> },
                  ]} acoes={(p: any) => (["ENVIADO", "EM_ANALISE", "EXIGENCIA"].includes(p.status) ? <Button size="small" onClick={() => avancar(p.id)}>Avançar (simulação)</Button> : null)} />
                </Estado>
              </Secao>
              <Secao titulo="Alvarás e licenças" acoes={<Button variant="outlined" onClick={() => run(() => host.post<any>(`${SOC}/aberturas/${id}/alvaras/gerar-checklist`, {}), "Checklist de alvarás gerado.")}>Gerar checklist por atividade</Button>}>
                <AlvarasLista aberturaId={id} recarga={a.alvaras?.length} />
              </Secao>
            </>
          ) : null}
        </Estado>
        <TextoImprimivel aberto={!!doc} titulo={doc?.titulo || ""} texto={doc?.texto || ""} aoFechar={() => setDoc(null)} />
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function Aberturas() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const lista = useApi<any>(`${SOC}/aberturas?pageSize=100${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const items: any[] = lista.data?.items || [];
  return (
    <Secao titulo="Empresas em abertura" acoes={<Button variant="contained" onClick={() => setNovo(true)}>Nova abertura</Button>}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" label="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: "1 1 200px" }} />
        <TextField size="small" select label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todas</MenuItem>{["EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"].map((s) => <MenuItem key={s} value={s}>{rotulo(s)}</MenuItem>)}
        </TextField>
      </Box>
      <Estado loading={lista.loading} error={lista.error} onRetry={lista.reload} vazio={!items.length} textoVazio="Nenhuma abertura ainda. Clique em “Nova abertura” para começar o passo a passo.">
        <Lista linhas={items} aoClicar={(r) => setSel(r.id)} colunas={[
          { titulo: "Empresa", principal: true, render: (r: any) => r.nomeEmpresarial }, { titulo: "Tipo", render: (r: any) => r.tipo }, { titulo: "Local", render: (r: any) => `${r.municipio || "—"}/${r.uf || "—"}` },
          { titulo: "Etapa", render: (r: any) => rotulo(r.etapa) }, { titulo: "CNPJ (simulado)", esconderNoCelular: true, render: (r: any) => r.cnpj || "—" },
          { titulo: "Progresso", render: (r: any) => <Box sx={{ minWidth: 90 }}><LinearProgress variant="determinate" value={r.progresso.percentual} /><Typography variant="caption">{r.progresso.concluidas}/{r.progresso.total} tarefas</Typography></Box> },
          { titulo: "Situação", render: (r: any) => <StatusChip v={r.status} /> },
        ]} acoes={(r: any) => <Button size="small" onClick={() => setSel(r.id)}>Abrir</Button>} />
      </Estado>
      {novo ? <Assistente aberto onClose={() => setNovo(false)} onCriada={(id) => { setNovo(false); lista.reload(); setSel(id); }} /> : null}
      {sel ? <Detalhe id={sel} onClose={() => setSel(null)} onChanged={lista.reload} /> : null}
    </Secao>
  );
}

import { Alert, Box, Chip, Button, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Bar, COLORS, FormDialog, Kanban, Kpi, KpiRow, LoadBox, Pick, Section, call, fmtDate, fmtNum, fmtPct, itemsOf, useApi, useToast } from "../desempenho/kit";
import MinhasRevisoes from "./MinhasRevisoes";
import SubmissaoDetalhe from "./SubmissaoDetalhe";

const COLS = ["SUBMETIDO", "TRIAGEM", "EM_REVISAO", "REVISOES_SOLICITADAS", "ACEITO", "EDITORACAO", "PUBLICADO", "REJEITADO", "RETIRADO"];
const COLOR: Record<string, string> = { SUBMETIDO: COLORS.mute, TRIAGEM: COLORS.info, EM_REVISAO: "#7a5cff", REVISOES_SOLICITADAS: COLORS.warn, ACEITO: "#5aa86b", EDITORACAO: "#2f8f83", PUBLICADO: COLORS.ok, REJEITADO: COLORS.bad, RETIRADO: COLORS.bad };

function Fluxo({ periodicoId, periodicos }: { periodicoId: string; periodicos: any[] }) {
  const [rev, setRev] = useState(0);
  const [det, setDet] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const { toast, node } = useToast();
  const subs = useApi<any>(`/pesquisa/submissoes?periodicoId=${periodicoId}&pageSize=100`, [rev]);
  const est = useApi<any>(`/pesquisa/periodicos/${periodicoId}/estatisticas`, [rev]);
  const secoes = useApi<any>(`/pesquisa/secoes?periodicoId=${periodicoId}&pageSize=50`);
  const rows = itemsOf(subs.data);
  const e = est.data;
  const per = periodicos.find((p) => p.id === periodicoId);
  return (
    <Box>
      {node}
      {e && (
        <KpiRow>
          <Kpi title="Submissões" value={e.total} hint={`${e.emAndamento} em andamento`} />
          <Kpi title="Taxa de aceitação" value={fmtPct(e.taxaAceitacao, 0)} hint={`${e.aceitos} aceitos · ${e.rejeitados} rejeitados`} color={COLORS.ok} />
          <Kpi title="Decisão (média)" value={e.tempoMedioDecisaoDias != null ? `${fmtNum(e.tempoMedioDecisaoDias, 0)} dias` : "—"} hint={e.tempoMedioAtePublicacaoDias != null ? `${fmtNum(e.tempoMedioAtePublicacaoDias, 0)} dias até publicar` : undefined} />
          <Kpi title="Pareceres no prazo" value={fmtPct(e.pareceristas?.percentualNoPrazo, 0)} hint={`${e.pareceristas?.concluidos ?? 0} concluídos · ${e.pareceristas?.recusados ?? 0} recusas · ${e.pareceristas?.expirados ?? 0} expirados`} color={(e.pareceristas?.percentualNoPrazo ?? 100) < 70 ? COLORS.bad : COLORS.ok} />
        </KpiRow>
      )}
      <Section title={`Fluxo editorial — ${per?.nome ?? ""}`} actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova submissão</Button>}>
        {per && <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Chip size="small" label={per.duploCego ? "Duplo-cego" : "Revisão aberta"} /><Chip size="small" label={`${per.revisoresPorSubmissao ?? 2} pareceristas/submissão`} /><Chip size="small" label={`Prazo de parecer ${per.prazoRevisaoDias ?? 30} dias`} />
          {!per.ativo && <Chip size="small" color="warning" label="Periódico inativo" />}
        </Box>}
        <LoadBox loading={subs.loading} error={subs.error} empty={!rows.length} emptyText="Nenhuma submissão neste periódico." onRetry={subs.reload}>
          <Kanban columns={COLS} items={rows} getCol={(r) => r.status} colors={COLOR} onOpen={(r) => setDet(r.id)}
            title={(r) => r.titulo} subtitle={(r) => `${r.codigo} · ${fmtDate(r.dataSubmissao)}`}
            meta={(r) => <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}><Chip size="small" label={`Rodada ${r.rodada}`} />{r.prazoAutorAte && <Chip size="small" color="warning" label={`autor até ${fmtDate(r.prazoAutorAte)}`} />}</Box>} />
        </LoadBox>
      </Section>
      {e && Object.keys(e.porStatus || {}).length > 0 && (
        <Section title="Distribuição por etapa">{Object.entries(e.porStatus).map(([k, v]) => <Bar key={k} label={k.replace(/_/g, " ")} value={Number(v)} max={e.total || 1} color={COLOR[k]} right={String(v)} />)}</Section>
      )}
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Nova submissão de manuscrito" submitLabel="Submeter"
        fields={[
          { key: "secaoId", label: "Seção", type: "select", options: itemsOf(secoes.data).map((s) => ({ value: s.id, label: s.nome })) }, { key: "idioma", label: "Idioma", type: "select", options: ["pt-BR", "en", "es"] },
          { key: "titulo", label: "Título (mín. 10 caracteres)", required: true, full: true }, { key: "resumo", label: "Resumo (mín. 100 caracteres)", type: "textarea", required: true }, { key: "abstract", label: "Abstract", type: "textarea" },
          { key: "palavrasChave", label: "Palavras-chave (3 a 8)", type: "list", required: true }, { key: "arquivoUrl", label: "Link do manuscrito", required: true },
          { key: "autorNome", label: "Autor correspondente — nome", required: true }, { key: "autorEmail", label: "Autor correspondente — e-mail", required: true }, { key: "autorAfiliacao", label: "Afiliação" }, { key: "autorOrcid", label: "ORCID" },
          { key: "conflitoInteresse", label: "Conflito de interesse" }, { key: "financiamento", label: "Financiamento" },
          { key: "declaracaoOriginalidade", label: "Declaro que o trabalho é original e não está em avaliação em outro periódico", type: "bool" },
        ]} initial={{ idioma: "pt-BR" }}
        onSubmit={async (b) => {
          const { autorNome, autorEmail, autorAfiliacao, autorOrcid, ...rest } = b;
          const r = await call("POST", "/pesquisa/submissoes", { ...rest, periodicoId, autores: [{ nome: autorNome, email: autorEmail, afiliacao: autorAfiliacao, orcid: autorOrcid, correspondente: true }] });
          toast({ type: "success", text: `Manuscrito ${r.codigo} submetido.` }); setRev((x) => x + 1);
        }} />
      {det && <SubmissaoDetalhe id={det} periodicoId={periodicoId} onClose={() => setDet(null)} onChange={() => setRev((x) => x + 1)} />}
    </Box>
  );
}

function Cadastros({ periodicos }: { periodicos: any[] }) {
  const [sub, setSub] = useState("periodicos");
  const opts = periodicos.map((p) => ({ value: p.id, label: p.nome }));
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2 }}>
        <ToggleButton value="periodicos">Periódicos</ToggleButton><ToggleButton value="edicoes">Edições</ToggleButton><ToggleButton value="equipe">Equipe editorial</ToggleButton><ToggleButton value="secoes">Seções</ToggleButton>
      </ToggleButtonGroup>
      {sub === "periodicos" && (
        <EduResourcePage title="Periódicos institucionais" base="/pesquisa" resource="/periodicos" description="Cada periódico tem seções padrão e o editor-chefe na equipe ao ser criado. Ative-o para aceitar submissões."
          columns={[{ key: "sigla", label: "Sigla" }, { key: "nome", label: "Nome" }, { key: "issn", label: "ISSN" }, { key: "area", label: "Área" }, { key: "duploCego", label: "Duplo-cego", render: (r) => (r.duploCego ? "Sim" : "Não") }, { key: "ativo", label: "Status", render: (r) => <StatusChip value={r.ativo ? "ATIVO" : "INATIVO"} /> }]}
          fields={[
            { key: "nome", label: "Nome", required: true }, { key: "sigla", label: "Sigla" }, { key: "slug", label: "Slug (URL pública)", helper: "minúsculas, números e hífen" }, { key: "issn", label: "ISSN" }, { key: "eissn", label: "e-ISSN" }, { key: "area", label: "Área" },
            { key: "doiPrefixo", label: "Prefixo DOI", helper: "Ex.: 10.12345" }, { key: "editorChefeNome", label: "Editor-chefe" }, { key: "emailContato", label: "E-mail de contato" }, { key: "periodicidade", label: "Periodicidade" },
            { key: "revisoresPorSubmissao", label: "Pareceristas por submissão", type: "number" }, { key: "prazoRevisaoDias", label: "Prazo de parecer (dias)", type: "number" }, { key: "prazoAutorDias", label: "Prazo de revisão do autor (dias)", type: "number" },
            { key: "escopo", label: "Escopo", type: "textarea" }, { key: "normas", label: "Normas para autores", type: "textarea" }, { key: "duploCego", label: "Revisão duplo-cego", type: "bool" }, { key: "politicaAcessoAberto", label: "Acesso aberto", type: "bool" }, { key: "ativo", label: "Ativo", type: "bool" },
          ]} />
      )}
      {sub === "edicoes" && (
        <EduResourcePage title="Edições (volumes e números)" base="/pesquisa" resource="/edicoes" filters={[{ key: "status", label: "Status", options: ["PLANEJADA", "EM_EDICAO", "PUBLICADA"] }]}
          description="Ao publicar, o sistema gera DOI, ordena os artigos e registra cada um na produção científica."
          rowActions={[{ label: "Publicar", path: "/edicoes/:id/publicar", color: "success", confirm: "Publicar esta edição? A ação gera DOIs e não pode ser desfeita.", hidden: (r) => r.status === "PUBLICADA" }]}
          columns={[{ key: "periodicoId", label: "Periódico", render: (r) => opts.find((o) => o.value === r.periodicoId)?.label ?? "—" }, { key: "volume", label: "Vol." }, { key: "numero", label: "Nº" }, { key: "ano", label: "Ano" }, { key: "titulo", label: "Título" }, { key: "_count", label: "Artigos", render: (r) => r._count?.submissoes ?? 0 }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]}
          fields={[{ key: "periodicoId", label: "Periódico", type: "select", options: opts, required: true, createOnly: true }, { key: "volume", label: "Volume", type: "number", required: true, createOnly: true }, { key: "numero", label: "Número", required: true, createOnly: true },
            { key: "ano", label: "Ano", type: "number", required: true, createOnly: true }, { key: "titulo", label: "Título (edição temática)" }, { key: "tipo", label: "Tipo", type: "select", options: ["REGULAR", "ESPECIAL", "SUPLEMENTO"] }, { key: "editorial", label: "Editorial", type: "textarea" }]} />
      )}
      {sub === "equipe" && (
        <EduResourcePage title="Equipe editorial e pareceristas" base="/pesquisa" resource="/periodicos-equipe" filters={[{ key: "papel", label: "Papel", options: ["EDITOR_CHEFE", "EDITOR_ASSOCIADO", "EDITOR_SECAO", "EDITOR_LAYOUT", "PARECERISTA"] }]}
          columns={[{ key: "nome", label: "Nome" }, { key: "papel", label: "Papel", render: (r) => String(r.papel).replace(/_/g, " ") }, { key: "periodicoId", label: "Periódico", render: (r) => opts.find((o) => o.value === r.periodicoId)?.label ?? "—" }, { key: "areas", label: "Áreas" }, { key: "instituicao", label: "Instituição" }, { key: "ativo", label: "Ativo" }]}
          fields={[{ key: "periodicoId", label: "Periódico", type: "select", options: opts, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail" }, { key: "papel", label: "Papel", type: "select", options: ["EDITOR_CHEFE", "EDITOR_ASSOCIADO", "EDITOR_SECAO", "EDITOR_LAYOUT", "PARECERISTA"] },
            { key: "areas", label: "Áreas de expertise", type: "json-list" }, { key: "instituicao", label: "Instituição" }, { key: "orcid", label: "ORCID" }, { key: "lattes", label: "Lattes" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
      {sub === "secoes" && (
        <EduResourcePage title="Seções do periódico" base="/pesquisa" resource="/secoes"
          columns={[{ key: "nome", label: "Seção" }, { key: "periodicoId", label: "Periódico", render: (r) => opts.find((o) => o.value === r.periodicoId)?.label ?? "—" }, { key: "ordem", label: "Ordem" }, { key: "revisadaPorPares", label: "Revisada por pares", render: (r) => (r.revisadaPorPares ? "Sim" : "Não") }]}
          fields={[{ key: "periodicoId", label: "Periódico", type: "select", options: opts, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "ordem", label: "Ordem", type: "number" }, { key: "revisadaPorPares", label: "Revisada por pares", type: "bool" }, { key: "ativa", label: "Ativa", type: "bool" }]} />
      )}
    </Box>
  );
}

export default function PeriodicoTab() {
  const [sub, setSub] = useState("fluxo");
  const [per, setPer] = useState("");
  const pers = useApi<any>("/pesquisa/periodicos?pageSize=100", [sub]);
  const list = itemsOf(pers.data);
  const cur = per || list[0]?.id || "";
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)}>
          <ToggleButton value="fluxo">Fluxo editorial</ToggleButton><ToggleButton value="revisoes">Meus pareceres</ToggleButton><ToggleButton value="cad">Cadastros</ToggleButton>
        </ToggleButtonGroup>
        {sub === "fluxo" && list.length > 0 && <Pick label="Periódico" value={cur} onChange={setPer} options={list.map((p) => ({ value: p.id, label: p.nome }))} minWidth={260} />}
      </Box>
      {sub === "revisoes" && <MinhasRevisoes />}
      {sub === "cad" && <Cadastros periodicos={list} />}
      {sub === "fluxo" && (
        <LoadBox loading={pers.loading} error={pers.error} onRetry={pers.reload} empty={!list.length}
          emptyText="Nenhum periódico cadastrado. Use a aba Cadastros para criar o periódico institucional e a equipe editorial.">
          {cur ? <Fluxo periodicoId={cur} periodicos={list} /> : <Alert severity="info">Selecione um periódico.</Alert>}
        </LoadBox>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Fluxo: submissão → triagem → revisão por pares → decisão → editoração → publicação na edição.</Typography>
    </Box>
  );
}

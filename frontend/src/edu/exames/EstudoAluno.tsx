// Área de estudo do aluno: trilhas, o que estudar (padrões), flashcards, desempenho e ranking opcional.
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, LinearProgress, Paper, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, Kpi, KpiRow, LoadBox, Section, Sparkline, call, fmtDate, fmtNum, fmtPct, semaforo, useApi, useRunner, useToast } from "../desempenho/kit";
import { AvisoAutoral, ExamePicker, X } from "./comum";
import type { ExameInfo } from "./comum";

// ---------------------------------------------------------------- trilha
export function TrilhaAluno({ exameId, exames, setExameId, irParaSimulados }: { exames: ExameInfo[]; exameId: string; setExameId: (v: string) => void; irParaSimulados: () => void }) {
  const lista = useApi<any>(`${X}/trilhas${exameId ? `?exameId=${exameId}` : ""}`);
  const [sel, setSel] = useState<string | null>(null);
  const det = useApi<any>(sel ? `${X}/trilhas/${sel}` : null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { det.reload(); lista.reload(); });
  const [estudo, setEstudo] = useState<any>(null);
  async function verEstudo(id: string, ia: boolean) { const r = await run(() => call("GET", `${X}/descritores/${id}/estudo${ia ? "?ia=1" : ""}`), ia ? "Roteiro gerado." : "Material aberto."); if (r && r !== true) setEstudo(r); }
  return (
    <Box>
      {node}
      <Box sx={{ mb: 2 }}><ExamePicker exames={exames} value={exameId} onChange={(v) => { setExameId(v); setSel(null); }} /></Box>
      {!sel ? (
        <Section title="Trilhas de estudo por curso/área e por matriz de referência">
          <LoadBox loading={lista.loading} error={lista.error} empty={!(lista.data?.items || []).length} emptyText="Nenhuma trilha para este exame. A coordenação pode gerar uma em 'Banco e gerador'." onRetry={lista.reload}>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
              {(lista.data?.items || []).map((t: any) => (
                <Paper key={t.id} variant="outlined" sx={{ p: 2, borderRadius: 3, cursor: "pointer" }} onClick={() => setSel(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(t.id)}>
                  <Typography sx={{ fontWeight: 800 }}>{t.titulo}</Typography>
                  <Typography variant="body2" color="text.secondary">{t.area || "Trilha geral"} · {t.totalEtapas} etapas</Typography>
                  <LinearProgress variant="determinate" value={t.totalEtapas ? ((t.etapasConcluidas || 0) / t.totalEtapas) * 100 : 0} sx={{ mt: 1, height: 6, borderRadius: 3 }} />
                  <Typography variant="caption" color="text.secondary">{t.etapasConcluidas || 0} de {t.totalEtapas} concluídas{t.geradaPorIa ? " · orientações com apoio de IA" : ""}</Typography>
                </Paper>
              ))}
            </Box>
          </LoadBox>
        </Section>
      ) : (
        <Section title={det.data?.titulo || "Trilha"} actions={<Button onClick={() => setSel(null)}>← Trilhas</Button>}>
          <LoadBox loading={det.loading} error={det.error} onRetry={det.reload}>
            {det.data && (
              <>
                <Typography color="text.secondary" sx={{ mb: 1 }}>{det.data.descricao}</Typography>
                <LinearProgress variant="determinate" value={det.data.progressoPct || 0} sx={{ mb: 2, height: 8, borderRadius: 4 }} />
                {det.data.etapas.map((e: any) => (
                  <Paper key={e.ordem} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 3, borderLeft: `6px solid ${e.concluida ? COLORS.ok : e.atual ? COLORS.info : COLORS.mute}` }}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 180 }}>{e.ordem}. {e.titulo}</Typography>
                      {e.atual && <Chip size="small" color="primary" label="Próxima etapa" />}
                      {e.acertoAtual != null && <Chip size="small" sx={{ bgcolor: semaforo(e.acertoAtual), color: "#fff" }} label={`Seu acerto: ${fmtPct(e.acertoAtual, 0)}`} />}
                      {e.abaixoDaMeta && <Chip size="small" color="warning" label="Reforçar" />}
                    </Box>
                    {e.orientacao && <Typography variant="body2" sx={{ my: 1 }}>{e.orientacao}</Typography>}
                    {e.descritores?.length > 0 && (
                      <Box sx={{ my: 1 }}>
                        <Typography variant="caption" color="text.secondary">Matriz de referência (descritores)</Typography>
                        {e.descritores.map((d: any) => (
                          <Box key={d.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                            <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}><strong>{d.codigo}</strong> — {d.descricao}</Typography>
                            <Button size="small" onClick={() => verEstudo(d.id, false)}>Material</Button>
                            <Button size="small" color="secondary" onClick={() => verEstudo(d.id, true)}>Roteiro com IA</Button>
                          </Box>
                        ))}
                      </Box>
                    )}
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {e.qtdQuestoes ? <Chip size="small" variant="outlined" label={`~${e.qtdQuestoes} questões`} /> : null}
                      <Button size="small" onClick={irParaSimulados}>Praticar</Button>
                      {e.concluida
                        ? <Button size="small" onClick={() => run(() => call("DELETE", `${X}/trilhas/${det.data.id}/etapas/${e.ordem}/concluir`), "Etapa reaberta.")}>Reabrir</Button>
                        : <Button size="small" variant="contained" onClick={() => run(() => call("POST", `${X}/trilhas/${det.data.id}/etapas/${e.ordem}/concluir`), "Etapa concluída!")}>Marcar como concluída</Button>}
                    </Box>
                  </Paper>
                ))}
              </>
            )}
          </LoadBox>
        </Section>
      )}
      {estudo && (
        <Section title={`Estudo — ${estudo.descritor?.codigo}`} actions={<Button onClick={() => setEstudo(null)}>Fechar</Button>}>
          <Typography sx={{ fontWeight: 700 }}>{estudo.descritor?.descricao}</Typography>
          <Typography variant="caption" color="text.secondary">{estudo.exame}{estudo.eixo ? ` · ${estudo.eixo}` : ""}</Typography>
          {estudo.resumo && <Typography sx={{ my: 1.5, whiteSpace: "pre-line" }}>{estudo.resumo}</Typography>}
          {estudo.ia?.texto && <Alert severity={estudo.ia.usada ? "info" : "warning"} sx={{ mt: 1, whiteSpace: "pre-line" }}>{estudo.ia.texto}{estudo.ia.aviso ? `\n\n${estudo.ia.aviso}` : ""}</Alert>}
        </Section>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------- o que estudar (padrões de provas anteriores)
export function SugestoesAluno({ exameId, exames, setExameId }: { exames: ExameInfo[]; exameId: string; setExameId: (v: string) => void }) {
  const r = useApi<any>(exameId ? `${X}/sugestoes?exameId=${exameId}` : null);
  const discursivas = useApi<any>(exameId ? `${X}/discursivas?exameId=${exameId}` : null);
  const [esp, setEsp] = useState<any>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast);
  const cor = (r_: string) => (r_ === "ALTA" ? COLORS.bad : r_ === "MEDIA" ? COLORS.warn : COLORS.mute);
  return (
    <Box>
      {node}
      <AvisoAutoral compacto />
      <Box sx={{ mb: 2 }}><ExamePicker exames={exames} value={exameId} onChange={setExameId} /></Box>
      <Section title="Temas que costumam aparecer — e onde você pode melhorar">
        <Alert severity="warning" sx={{ mb: 2 }}>{r.data?.aviso || "Sugestões baseiam-se na recorrência de temas em edições anteriores. Não são previsão da prova real."}{r.data?.ilustrativo ? " Os perfis atuais são ILUSTRATIVOS (síntese autoral), não estatísticas oficiais." : ""}</Alert>
        <LoadBox loading={r.loading} error={r.error} empty={!r.data?.temas?.length} emptyText={exameId ? "Ainda não há perfil de prova cadastrado para este exame." : "Escolha um exame."} onRetry={r.reload}>
          {(r.data?.temas || []).map((t: any) => (
            <Paper key={t.tema} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2, display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 700 }}>{t.tema}</Typography>
                <Typography variant="caption" color="text.secondary">~{fmtNum(t.frequenciaMedia)}% das questões nas edições analisadas ({t.aparicoes}/{t.anosAnalisados}) · tendência {t.tendencia.toLowerCase()}</Typography>
              </Box>
              <Chip size="small" sx={{ bgcolor: cor(t.recorrencia), color: "#fff" }} label={`Recorrência ${t.recorrencia.toLowerCase()}`} />
              <Chip size="small" variant="outlined" label={t.acertoAtual == null ? "Sem treino ainda" : `Seu acerto: ${fmtPct(t.acertoAtual, 0)}`} />
              <Chip size="small" variant="outlined" label={`${t.questoesDisponiveis} questão(ões)`} />
            </Paper>
          ))}
        </LoadBox>
      </Section>
      {(discursivas.data?.items || []).length > 0 && (
        <Section title="Discursivas (ex.: OAB 2ª fase) com espelho para autocorreção">
          {(discursivas.data.items as any[]).map((q) => (
            <Paper key={q.id} variant="outlined" sx={{ p: 2, mb: 1, borderRadius: 2 }}>
              <Typography sx={{ whiteSpace: "pre-line" }}>{q.enunciado}</Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={async () => { const e = await run(() => call("GET", `${X}/questoes/${q.id}/espelho`)); if (e && e !== true) setEsp(e); }}>Ver espelho (depois de tentar responder)</Button>
              {esp?.id === q.id && <Alert severity="info" sx={{ mt: 1, whiteSpace: "pre-line" }}><strong>Espelho:</strong> {esp.espelho}{"\n"}<strong>Critérios:</strong> {esp.criterios}{"\n"}{esp.aviso}</Alert>}
            </Paper>
          ))}
        </Section>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------- flashcards (repetição espaçada)
export function FlashcardsAluno({ exameId, exames, setExameId }: { exames: ExameInfo[]; exameId: string; setExameId: (v: string) => void }) {
  const hoje = useApi<any>(`${X}/flashcards/hoje${exameId ? `?exameId=${exameId}` : ""}`);
  const todos = useApi<any>(`${X}/flashcards${exameId ? `?exameId=${exameId}` : ""}`);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { hoje.reload(); todos.reload(); });
  const [mostrar, setMostrar] = useState(false);
  const atual = (hoje.data?.items || [])[0];
  async function avaliar(q: number) { if (!atual) return; await run(() => call("POST", `${X}/flashcards/${atual.id}/revisar`, { qualidade: q }), q >= 3 ? "Anotado! Volta mais adiante." : "Sem problema: volta amanhã."); setMostrar(false); }
  return (
    <Box>
      {node}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <ExamePicker exames={exames} value={exameId} onChange={setExameId} />
        <Button variant="outlined" disabled={!exameId} onClick={() => run(() => call("POST", `${X}/flashcards/gerar`, { exameId }).then((r) => { toast({ type: "success", text: `${r.criadosDeErros} cartão(ões) de erros e ${r.criadosDeTemasFracos} de temas fracos.` }); return r; }), "Cartões gerados.")}>Gerar dos meus erros e temas fracos</Button>
        <Button variant="outlined" disabled={!exameId} onClick={() => run(() => call("POST", `${X}/flashcards/adotar`, { exameId }), "Cartões da instituição adicionados ao seu baralho.")}>Adotar cartões da instituição</Button>
      </Box>
      <KpiRow>
        <Kpi title="Para revisar hoje" value={hoje.data?.total ?? "—"} color={COLORS.info} />
        <Kpi title="No meu baralho" value={todos.data?.total ?? "—"} />
      </KpiRow>
      <Section title="Revisão de hoje">
        <LoadBox loading={hoje.loading} error={hoje.error} empty={!atual} emptyText="Nada para revisar agora. Gere cartões dos seus erros ou adote os da instituição." onRetry={hoje.reload}>
          {atual && (
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, textAlign: "center" }}>
              {atual.tema && <Chip size="small" label={atual.tema} sx={{ mb: 1 }} />}
              <Typography variant="h6" sx={{ whiteSpace: "pre-line", fontWeight: 700 }}>{atual.frente}</Typography>
              {mostrar ? (
                <>
                  <Alert severity="success" icon={false} sx={{ my: 2, textAlign: "left", whiteSpace: "pre-line" }}>{atual.verso}</Alert>
                  <Typography variant="body2" sx={{ mb: 1 }}>Como foi?</Typography>
                  <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
                    <Button color="error" variant="outlined" onClick={() => avaliar(1)}>Errei</Button>
                    <Button color="warning" variant="outlined" onClick={() => avaliar(3)}>Difícil</Button>
                    <Button color="primary" variant="outlined" onClick={() => avaliar(4)}>Bom</Button>
                    <Button color="success" variant="contained" onClick={() => avaliar(5)}>Fácil</Button>
                  </Box>
                </>
              ) : <Button variant="contained" sx={{ mt: 2 }} onClick={() => setMostrar(true)}>Mostrar resposta</Button>}
            </Paper>
          )}
        </LoadBox>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Repetição espaçada (SM-2 simplificado): acertar espaça a próxima revisão; errar traz o cartão de volta no dia seguinte.</Typography>
      </Section>
    </Box>
  );
}

// ---------------------------------------------------------------- desempenho
export function DesempenhoAluno({ exameId, exames, setExameId }: { exames: ExameInfo[]; exameId: string; setExameId: (v: string) => void }) {
  const r = useApi<any>(`${X}/meu-desempenho${exameId ? `?exameId=${exameId}` : ""}`);
  const d = r.data;
  return (
    <Box>
      <Box sx={{ mb: 2 }}><ExamePicker exames={exames} value={exameId} onChange={setExameId} label="Exame (vazio = todos)" /></Box>
      <LoadBox loading={r.loading} error={r.error} onRetry={r.reload} empty={d && !d.sessoes} emptyText="Faça um simulado ou treino para ver seu relatório de desempenho.">
        {d && (
          <>
            <KpiRow>
              <Kpi title="Média das últimas 3" value={fmtPct(d.mediaUltimas3, 0)} color={semaforo(d.mediaUltimas3)} hint={`Meta: ${fmtPct(d.metaPct, 0)}`} />
              <Kpi title="Melhor resultado" value={fmtPct(d.melhor, 0)} />
              <Kpi title="Provas feitas" value={d.sessoes} />
              {d.projecao && <Kpi title="Projeção (estimativa)" value={d.projecao.conceito ? `Conceito ${d.projecao.conceito}` : d.projecao.aprovadoProvavel ? "Acima do corte" : "Abaixo do corte"} hint="Estimativa interna" />}
            </KpiRow>
            <Section title="Evolução">
              <Sparkline values={d.evolucao.map((p: any) => p.percentual)} labels={d.evolucao.map((p: any) => `${p.simulado} (${fmtDate(p.data)})`)} />
            </Section>
            <Section title="Por eixo / área">
              {d.porEixo.map((e: any) => <Bar key={e.eixoId} value={e.percentual} color={semaforo(e.percentual, d.metaPct, 40)} meta={d.metaPct} label={e.nome} right={`${e.acertos}/${e.total} · ${fmtPct(e.percentual, 0)}`} />)}
            </Section>
            <Section title="Temas e descritores para reforçar">
              {d.temasFracos.length ? d.temasFracos.map((t: any) => <Bar key={t.tema} value={t.percentual} color={semaforo(t.percentual)} label={t.tema} right={`${t.acertos}/${t.total}`} />) : <Typography color="text.secondary">Nenhum tema abaixo da meta. Continue treinando!</Typography>}
              {d.porDescritor.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Descritores com pior desempenho: {d.porDescritor.slice(0, 5).map((x: any) => `${x.codigo} (${fmtPct(x.percentual, 0)})`).join(" · ")}</Typography>}
            </Section>
            <Typography variant="caption" color="text.secondary">{d.aviso}</Typography>
          </>
        )}
      </LoadBox>
    </Box>
  );
}

// ---------------------------------------------------------------- ranking opcional + privacidade
export function RankingAluno({ exameId, exames, setExameId }: { exames: ExameInfo[]; exameId: string; setExameId: (v: string) => void }) {
  const pref = useApi<any>(`${X}/preferencias`);
  const rk = useApi<any>(exameId && pref.data?.rankingParticipa && pref.data?.rankingDisponivel ? `${X}/ranking?exameId=${exameId}` : null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { pref.reload(); rk.reload(); });
  return (
    <Box>
      {node}
      <Section title="Ranking da turma (opcional)">
        <LoadBox loading={pref.loading} error={pref.error} onRetry={pref.reload}>
          {!pref.data?.rankingDisponivel ? <Alert severity="info">O ranking não está habilitado pela instituição.</Alert> : (
            <>
              <FormControlLabel control={<Checkbox checked={!!pref.data?.rankingParticipa} onChange={(e) => run(() => call("PUT", `${X}/preferencias`, { rankingParticipa: e.target.checked }), e.target.checked ? "Você entrou no ranking." : "Você saiu do ranking.")} />} label="Quero participar do ranking (meu nome abreviado e minha média ficam visíveis aos colegas que também participam)" />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>{pref.data?.informacao}</Typography>
              {pref.data?.rankingParticipa && (
                <>
                  <Box sx={{ mb: 1 }}><ExamePicker exames={exames} value={exameId} onChange={setExameId} /></Box>
                  <LoadBox loading={rk.loading} error={rk.error} empty={!rk.data?.itens?.length} emptyText="Ainda sem participantes com provas neste exame." onRetry={rk.reload}>
                    {(rk.data?.itens || []).map((i: any) => (
                      <Box key={i.posicao} sx={{ display: "flex", gap: 1.5, py: 0.75, borderBottom: 1, borderColor: "divider", alignItems: "center", fontWeight: i.voce ? 800 : 400 }}>
                        <Chip size="small" label={`${i.posicao}º`} color={i.posicao <= 3 ? "primary" : "default"} />
                        <Typography sx={{ flex: 1, fontWeight: "inherit" }}>{i.aluno}{i.voce ? " (você)" : ""}</Typography>
                        <Typography sx={{ fontWeight: "inherit" }}>{fmtPct(i.media, 0)}</Typography>
                      </Box>
                    ))}
                    <Typography variant="caption" color="text.secondary">{rk.data?.criterio} · {rk.data?.aviso}</Typography>
                  </LoadBox>
                </>
              )}
            </>
          )}
        </LoadBox>
      </Section>
      <MeusDados />
    </Box>
  );
}

function MeusDados() {
  const { toast, node } = useToast();
  const run = useRunner(toast);
  return (
    <Section title="Meus dados de preparação (LGPD)">
      {node}
      <Typography variant="body2" sx={{ mb: 1 }}>Seus simulados, cartões e progresso são visíveis a você, à coordenação e à docência do seu curso, para acompanhamento pedagógico. Você pode exportar ou apagar esses dados.</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={async () => { const r = await run(() => call("GET", `${X}/meus-dados`), "Exportação pronta."); if (r && r !== true) { const u = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = u; a.download = "meus-dados-preparacao.json"; a.click(); } }}>Exportar meus dados</Button>
        <Button color="error" variant="outlined" onClick={() => run(() => call("DELETE", `${X}/meus-dados`), "Dados apagados.", "Apagar todos os seus simulados, cartões e progresso de preparação? Isso não pode ser desfeito.")}>Apagar meus dados</Button>
      </Box>
    </Section>
  );
}

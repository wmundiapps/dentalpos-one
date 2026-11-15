import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useMemo, useState } from "react";
import { call, fmtDateTime, LoadBox, Pick, Section, useApi, useToast } from "../desempenho/kit";
import { avisarAcessoAtualizado } from "./modulos";

type Estado = "PADRAO" | "PERMITIR" | "BLOQUEAR";
interface Catalogo { cargos: Array<{ cargo: string; nome: string; super: boolean }>; modulos: Array<{ modulo: string; nome: string; grupo: string; essencial: boolean }> }
interface Regra { cargo: string; modulo: string; estado: Estado; alteradoPorNome?: string | null; alteradoEm?: string }
interface Matriz { regras: Regra[]; totais: { bloqueios: number; concessoes: number }; podeEditar: boolean }

const ROTULO: Record<Estado, string> = { PADRAO: "Padrão", PERMITIR: "Permitir", BLOQUEAR: "Bloquear" };
const COR: Record<Estado, string> = { PADRAO: "transparent", PERMITIR: "#dff3e6", BLOQUEAR: "#fbe0e0" };
const COR_TXT: Record<Estado, string> = { PADRAO: "inherit", PERMITIR: "#1d6b3a", BLOQUEAR: "#a12a2a" };
const k = (cargo: string, modulo: string) => `${cargo}|${modulo}`;

function Celula({ valor, onChange, travada, motivo, etiqueta }: { valor: Estado; onChange: (e: Estado) => void; travada: boolean; motivo?: string; etiqueta: string }) {
  return (
    <Select
      size="small" variant="outlined" value={valor} disabled={travada} title={travada ? motivo : undefined}
      onChange={(ev) => onChange(ev.target.value as Estado)}
      inputProps={{ "aria-label": etiqueta }}
      sx={{ minWidth: 104, fontSize: 13, bgcolor: COR[valor], color: COR_TXT[valor], fontWeight: valor === "PADRAO" ? 400 : 700, "& .MuiSelect-select": { py: 0.5 } }}
    >
      {(Object.keys(ROTULO) as Estado[]).map((e) => <MenuItem key={e} value={e}>{ROTULO[e]}</MenuItem>)}
    </Select>
  );
}

export default function MatrizAcesso() {
  const theme = useTheme();
  const celular = useMediaQuery(theme.breakpoints.down("md"));
  const { toast, node } = useToast();
  const [rev, setRev] = useState(0);
  const cat = useApi<Catalogo>("/acesso/catalogo");
  const mat = useApi<Matriz>("/acesso/matriz", [rev]);
  const hist = useApi<any>("/acesso/historico?pageSize=15", [rev]);
  const [rascunho, setRascunho] = useState<Record<string, Estado>>({});
  const [grupo, setGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const [cargoFoco, setCargoFoco] = useState("");
  const [soAlterados, setSoAlterados] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pagCargos, setPagCargos] = useState(1);

  const salvas = useMemo(() => {
    const m = new Map<string, Regra>();
    (mat.data?.regras || []).forEach((r) => m.set(k(r.cargo, r.modulo), r));
    return m;
  }, [mat.data]);
  const estadoSalvo = (cargo: string, modulo: string): Estado => salvas.get(k(cargo, modulo))?.estado || "PADRAO";
  const estadoAtual = (cargo: string, modulo: string): Estado => rascunho[k(cargo, modulo)] ?? estadoSalvo(cargo, modulo);

  const cargos = cat.data?.cargos || [];
  const grupos = useMemo(() => Array.from(new Set((cat.data?.modulos || []).map((m) => m.grupo))), [cat.data]);
  const modulos = useMemo(() => (cat.data?.modulos || []).filter((m) => {
    if (grupo && m.grupo !== grupo) return false;
    if (busca && !(`${m.nome} ${m.modulo}`.toLowerCase().includes(busca.toLowerCase()))) return false;
    if (soAlterados && !cargos.some((c) => estadoAtual(c.cargo, m.modulo) !== "PADRAO")) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cat.data, grupo, busca, soAlterados, rascunho, mat.data]);
  const cargosVisiveis = cargoFoco ? cargos.filter((c) => c.cargo === cargoFoco) : cargos;
  const POR_PAGINA = 6;
  const colunas = cargoFoco ? cargosVisiveis : cargosVisiveis.slice((pagCargos - 1) * POR_PAGINA, pagCargos * POR_PAGINA);
  const pendentes = Object.keys(rascunho).length;

  function mudar(cargo: string, modulo: string, e: Estado) {
    setRascunho((r) => {
      const n = { ...r };
      if (e === estadoSalvo(cargo, modulo)) delete n[k(cargo, modulo)]; else n[k(cargo, modulo)] = e;
      return n;
    });
  }

  async function salvar() {
    setSalvando(true);
    try {
      const alteracoes = Object.entries(rascunho).map(([chave, estado]) => { const [cargo, modulo] = chave.split("|"); return { cargo, modulo, estado }; });
      const r = await call<{ alteradas: number }>("PUT", "/acesso/regras", { alteracoes });
      toast({ type: "success", text: `${r.alteradas} regra(s) salva(s). O menu dos usuários é atualizado em instantes.` });
      setRascunho({});
      setRev((v) => v + 1);
      avisarAcessoAtualizado();
    } catch (e: any) {
      toast({ type: "error", text: e?.message || "Não foi possível salvar." });
    } finally { setSalvando(false); }
  }

  async function restaurar() {
    const alvo = cargoFoco ? cargos.find((c) => c.cargo === cargoFoco)?.nome : "TODOS os cargos";
    if (!window.confirm(`Restaurar o padrão para ${alvo}? Todas as regras de bloqueio e permissão serão removidas.`)) return;
    try {
      const r = await call<{ restauradas: number }>("POST", "/acesso/restaurar-padrao", cargoFoco ? { cargo: cargoFoco } : {});
      toast({ type: "success", text: `${r.restauradas} regra(s) restaurada(s) ao padrão.` });
      setRascunho({});
      setRev((v) => v + 1);
      avisarAcessoAtualizado();
    } catch (e: any) { toast({ type: "error", text: e?.message || "Não foi possível restaurar." }); }
  }

  const carregando = cat.loading || mat.loading;
  const erro = cat.error || mat.error;

  return (
    <>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>
        Defina, por cargo, quais módulos ficam <b>bloqueados</b> (o cargo não abre o módulo e ele some do menu), <b>permitidos</b> (libera o cargo nas telas de gestão do módulo) ou no <b>padrão</b> (regras próprias de cada tela).
        Administração, proprietário, reitoria e conselho nunca são bloqueados. Mudanças valem em até 30 segundos e ficam registradas na auditoria.
      </Alert>
      <Section
        title="Matriz de acesso"
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button variant="outlined" onClick={() => setPrevia(cargoFoco || "SECRETARY")}>O que este cargo vê</Button>
            <Button variant="outlined" color="warning" onClick={restaurar}>Restaurar padrão{cargoFoco ? " do cargo" : ""}</Button>
            <Button variant="outlined" disabled={!pendentes} onClick={() => setRascunho({})}>Descartar</Button>
            <Button variant="contained" disabled={!pendentes || salvando} onClick={salvar}>Salvar{pendentes ? ` (${pendentes})` : ""}</Button>
          </Stack>
        }
      >
        <LoadBox loading={carregando} error={erro} onRetry={() => { cat.reload(); mat.reload(); }}>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
            <TextField size="small" label="Buscar módulo" value={busca} onChange={(e) => setBusca(e.target.value)} sx={{ minWidth: 200, flex: { xs: "1 1 100%", sm: "0 0 auto" } }} />
            <Pick label="Grupo" value={grupo} onChange={setGrupo} options={grupos.map((g) => ({ value: g, label: g }))} all="Todos" minWidth={180} />
            <Pick label="Cargo" value={cargoFoco} onChange={(v) => { setCargoFoco(v); setPagCargos(1); }} options={cargos.map((c) => ({ value: c.cargo, label: c.nome }))} all="Todos os cargos" minWidth={200} />
            <Chip label={soAlterados ? "Mostrando só módulos com regra" : "Só módulos com regra"} color={soAlterados ? "primary" : "default"} variant={soAlterados ? "filled" : "outlined"} onClick={() => setSoAlterados((v) => !v)} />
            <Chip size="small" color="error" variant="outlined" label={`${mat.data?.totais.bloqueios ?? 0} bloqueio(s)`} />
            <Chip size="small" color="success" variant="outlined" label={`${mat.data?.totais.concessoes ?? 0} permissão(ões)`} />
          </Box>

          {!modulos.length ? (
            <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhum módulo encontrado com esses filtros.</Typography>
          ) : celular && !cargoFoco ? (
            <Alert severity="info">No celular, escolha um <b>cargo</b> acima para editar os módulos dele.</Alert>
          ) : (
            <>
              {!cargoFoco && cargos.length > POR_PAGINA ? (
                <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
                  <Pagination size="small" count={Math.ceil(cargos.length / POR_PAGINA)} page={pagCargos} onChange={(_, p) => setPagCargos(p)} />
                </Box>
              ) : null}
              <TableContainer sx={{ maxHeight: { md: 640 }, border: 1, borderColor: "divider", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ minWidth: { xs: 140, md: 260 }, fontWeight: 800, position: "sticky", left: 0, zIndex: 3, bgcolor: "background.paper" }}>Módulo</TableCell>
                      {colunas.map((c) => (
                        <TableCell key={c.cargo} sx={{ fontWeight: 800, minWidth: 120 }}>
                          {c.nome}
                          {c.super ? <Chip size="small" label="acesso total" sx={{ ml: 0.5, height: 18, fontSize: 10 }} /> : null}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {modulos.map((m) => (
                      <TableRow key={m.modulo} hover>
                        <TableCell sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.nome}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.grupo}</Typography>
                        </TableCell>
                        {colunas.map((c) => {
                          const travada = c.super || m.essencial;
                          const salvo = salvas.get(k(c.cargo, m.modulo));
                          return (
                            <TableCell key={c.cargo}>
                              <Celula
                                valor={estadoAtual(c.cargo, m.modulo)} travada={travada}
                                motivo={c.super ? "Este cargo tem acesso total e não pode ser bloqueado." : "Módulo essencial ao sistema."}
                                etiqueta={`${m.nome} para ${c.nome}`}
                                onChange={(e) => mudar(c.cargo, m.modulo, e)}
                              />
                              {rascunho[k(c.cargo, m.modulo)] ? <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>não salvo</Typography>
                                : salvo && salvo.estado !== "PADRAO" ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{salvo.alteradoPorNome || "—"} · {fmtDateTime(salvo.alteradoEm)}</Typography> : null}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </LoadBox>
      </Section>

      <Section title="Últimas alterações (auditoria)">
        <LoadBox loading={hist.loading} error={hist.error} onRetry={hist.reload} empty={!hist.data?.items?.length} emptyText="Nenhuma alteração registrada ainda.">
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow><TableCell>Quando</TableCell><TableCell>Quem</TableCell><TableCell>O quê</TableCell></TableRow></TableHead>
              <TableBody>
                {(hist.data?.items || []).map((h: any) => (
                  <TableRow key={h.id}>
                    <TableCell>{fmtDateTime(h.quando)}</TableCell>
                    <TableCell>{h.quem || "—"}</TableCell>
                    <TableCell>
                      {h.acao === "MATRIZ_RESTAURADA"
                        ? `Padrão restaurado (${h.detalhes?.cargo || "todos"}; ${h.detalhes?.regrasRemovidas ?? 0} regra(s))`
                        : `${h.detalhes?.cargo} · ${h.detalhes?.modulo}: ${ROTULO[h.detalhes?.de as Estado] || h.detalhes?.de} → ${ROTULO[h.detalhes?.para as Estado] || h.detalhes?.para}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </LoadBox>
      </Section>

      <Previa aberto={previa} onClose={() => setPrevia(null)} onTrocar={setPrevia} cargos={cargos} modulos={cat.data?.modulos || []} estadoAtual={estadoAtual} />
    </>
  );
}

function Previa({ aberto, onClose, onTrocar, cargos, modulos, estadoAtual }: {
  aberto: string | null; onClose: () => void; onTrocar: (c: string) => void;
  cargos: Catalogo["cargos"]; modulos: Catalogo["modulos"]; estadoAtual: (c: string, m: string) => Estado;
}) {
  const cargo = cargos.find((c) => c.cargo === aberto);
  const linhas = modulos.map((m) => {
    const e = cargo ? estadoAtual(cargo.cargo, m.modulo) : "PADRAO";
    const efetivo = !cargo ? "PADRAO" : cargo.super || m.essencial ? "LIBERADO" : e === "BLOQUEAR" ? "BLOQUEADO" : e === "PERMITIR" ? "LIBERADO_REGRA" : "PADRAO";
    return { ...m, efetivo };
  });
  const bloqueados = linhas.filter((l) => l.efetivo === "BLOQUEADO");
  const visiveis = linhas.filter((l) => l.efetivo !== "BLOQUEADO");
  return (
    <Dialog open={!!aberto} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>O que este cargo vê</DialogTitle>
      <DialogContent dividers>
        <Pick label="Cargo" value={aberto || ""} onChange={onTrocar} options={cargos.map((c) => ({ value: c.cargo, label: c.nome }))} minWidth={240} />
        {cargo ? (
          <>
            <Alert severity={cargo.super ? "success" : "info"} sx={{ my: 2 }}>
              {cargo.super
                ? "Este cargo tem acesso total: vê todos os módulos e nunca é bloqueado."
                : `${visiveis.length} módulo(s) aparecem no menu e ${bloqueados.length} ficam ocultos e bloqueados. “Padrão” significa que a própria tela decide o que o cargo pode fazer. A pré-visualização inclui as alterações ainda não salvas.`}
            </Alert>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Aparece no menu</Typography>
            <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mb: 2 }}>
              {visiveis.map((l) => <Chip key={l.modulo} size="small" label={l.nome} color={l.efetivo === "LIBERADO_REGRA" ? "success" : "default"} variant={l.efetivo === "PADRAO" ? "outlined" : "filled"} />)}
            </Box>
            {bloqueados.length ? (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Oculto e bloqueado</Typography>
                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                  {bloqueados.map((l) => <Chip key={l.modulo} size="small" color="error" variant="outlined" label={l.nome} />)}
                </Box>
              </>
            ) : null}
          </>
        ) : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

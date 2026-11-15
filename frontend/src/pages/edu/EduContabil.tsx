import { Alert, Box, Button, CircularProgress, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { ABAS_CONTABIL } from "../../edu/contabil/abas";
import { C, ContabilCtx, FaixaAviso, NOME_PAPEL, REGIMES, api, errMsg, type Eu } from "../../edu/contabil/kit";

/** Escritório de Contabilidade (EduMaster Pro). Hub com abas por área; ?aba=<id>&empresa=<id>. */
export default function EduContabil() {
  const [params, setParams] = useSearchParams();
  const [eu, setEu] = useState<Eu | null>(null);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<{ msg: string; status?: number } | null>(null);
  const lembrada = (() => { try { return sessionStorage.getItem("ctb.empresa") || ""; } catch { return ""; } })();
  const [empresaId, setEmpresaId] = useState(params.get("empresa") || lembrada);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [e, l] = await Promise.all([api.get<Eu>(`${C}/eu`), api.get<any>(`${C}/empresas?pageSize=200&ativo=true`)]);
      setEu(e); setEmpresas(l.items); setErro(null);
    } catch (x: any) { setErro({ msg: errMsg(x), status: x?.status }); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const escolher = (id: string) => {
    setEmpresaId(id);
    try { sessionStorage.setItem("ctb.empresa", id); } catch { /* armazenamento indisponível */ }
    setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("empresa", id); else n.delete("empresa"); return n; }, { replace: true });
  };
  // empresa lembrada que não existe mais (ou é de outro tenant) é ignorada
  useEffect(() => { if (empresaId && empresas.length && !empresas.some((e) => e.id === empresaId)) setEmpresaId(""); }, [empresas, empresaId]);

  const abaId = params.get("aba") || "painel";
  const aba = ABAS_CONTABIL.find((a) => a.id === abaId) ?? ABAS_CONTABIL[0];
  const irPara = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("aba", id); return n; }, { replace: true });
  const ctx = useMemo(() => ({ eu, empresaId, empresas, recarregarEmpresas: () => void carregar(), pode: (p: string) => !!eu?.permissoes.includes(p) }), [eu, empresaId, empresas, carregar]);
  const empresa = empresas.find((e) => e.id === empresaId);

  return (
    <EduShell hero={false} title="Contabilidade" subtitle={`Escritório de contabilidade · EduMaster Pro${eu?.instituicao ? ` · ${eu.instituicao}` : ""}`}
      actions={eu ? <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><TextField size="small" disabled value={`Papel: ${NOME_PAPEL[eu.papel]}`} sx={{ width: 160 }} /></Box> : undefined}>
      <FaixaAviso />
      {carregando ? (
        <Box sx={{ py: 6, textAlign: "center" }} role="status"><CircularProgress /></Box>
      ) : erro ? (
        <Alert severity={erro.status === 403 ? "info" : "error"} action={erro.status === 403 ? undefined : <Button color="inherit" size="small" onClick={() => void carregar()}>Tentar de novo</Button>}>
          {erro.status === 403 ? "Seu cargo não tem acesso à Contabilidade. Peça ao gestor para designar o papel de contador, financeiro ou leitura em Contabilidade › Acesso e auditoria." : erro.msg}
        </Alert>
      ) : (
        <ContabilCtx.Provider value={ctx}>
          <Box sx={{ display: "flex", gap: 2, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" label="Empresa" value={empresaId} onChange={(e) => escolher(e.target.value)} sx={{ minWidth: { xs: "100%", sm: 340 } }} helperText={empresa ? `${REGIMES[empresa.regimeAtual] ?? empresa.regimeAtual}${empresa.municipio ? ` · ${empresa.municipio}/${empresa.uf ?? ""}` : ""}` : "Todas as empresas (visão do escritório)"}>
              <MenuItem value="">Todas as empresas</MenuItem>
              {empresas.map((e) => <MenuItem key={e.id} value={e.id}>{e.razaoSocial}</MenuItem>)}
            </TextField>
          </Box>
          <Tabs value={aba.id} onChange={(_, v) => irPara(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
            {ABAS_CONTABIL.map((a) => <Tab key={a.id} value={a.id} label={a.rotulo} />)}
          </Tabs>
          <Suspense fallback={<Box sx={{ py: 5, textAlign: "center" }} role="status"><CircularProgress size={28} /></Box>}>
            <aba.Componente onIr={irPara} />
          </Suspense>
        </ContabilCtx.Provider>
      )}
    </EduShell>
  );
}

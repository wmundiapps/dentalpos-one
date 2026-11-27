import { Alert, Box, Button, Card, CardActionArea, CardContent, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { useEffect, useMemo, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, Panel, Stat, StatGrid, brl, itemsOf, num, openHtml, useApi, useToast } from "../infraestrutura/kit";

export const CANAIS = ["LOJA", "PAPELARIA", "UNIFORMES", "LIVRARIA", "CURSOS_LIVRES", "CANTINA"];

export function AbrirCaixa({ onOpened }: { onOpened: () => void }) {
  const [valor, setValor] = useState("0");
  const [canal, setCanal] = useState("LOJA");
  const toast = useToast();
  return (
    <Panel title="Caixa fechado" subtitle="Abra o caixa para registrar vendas.">
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <TextField size="small" type="number" label="Valor de abertura (R$)" value={valor} onChange={(e) => setValor(e.target.value)} />
        <TextField select size="small" label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} sx={{ minWidth: 170 }}>{CANAIS.map((c) => <MenuItem key={c} value={c}>{c.replace(/_/g, " ")}</MenuItem>)}</TextField>
        <Button variant="contained" onClick={() => toast.run(() => eduApi.post("/suprimentos/caixa/abrir", { valorAbertura: Number(valor) || 0, canal }), "Caixa aberto.", onOpened)}>Abrir caixa</Button>
      </Box>
      {toast.node}
    </Panel>
  );
}

interface Linha { id: string; nome: string; preco: number; qtd: number; estoque: number }

export default function PdvPanel({ caixa, onSold }: { caixa: any; onSold: () => void }) {
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState("");
  const prods = useApi<any>(`/suprimentos/produtos-pdv${qsOf({ q, canal })}`);
  const [cart, setCart] = useState<Linha[]>([]);
  const [tipo, setTipo] = useState("A_VISTA");
  const [forma, setForma] = useState("PIX");
  const [desconto, setDesconto] = useState("0");
  const [cliente, setCliente] = useState("");
  const [aluno, setAluno] = useState("");
  const [alunoBusca, setAlunoBusca] = useState("");
  const [achados, setAchados] = useState<any[]>([]);
  const [parcelas, setParcelas] = useState("1");
  const [ultima, setUltima] = useState<any | null>(null);
  const toast = useToast();

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.preco * l.qtd, 0), [cart]);
  const total = Math.max(0, subtotal - (Number(desconto) || 0));
  useEffect(() => { setAchados([]); }, [alunoBusca]);

  function add(p: any) {
    setCart((c) => {
      const i = c.findIndex((l) => l.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qtd: l.qtd + 1 } : l));
      return [...c, { id: p.id, nome: p.nome, preco: p.preco, qtd: 1, estoque: p.estoque }];
    });
  }
  const mudar = (id: string, d: number) => setCart((c) => c.map((l) => (l.id === id ? { ...l, qtd: l.qtd + d } : l)).filter((l) => l.qtd > 0));

  async function buscarAluno() {
    try { setAchados(itemsOf(await eduApi.get(`/academico/students${qsOf({ q: alunoBusca, pageSize: 8 })}`))); if (!alunoBusca) return; }
    catch { toast.err("Sem permissão para pesquisar alunos: informe o ID do aluno manualmente."); }
  }
  async function finalizar() {
    if (!cart.length) { toast.err("Adicione produtos à venda."); return; }
    if (tipo === "LANCADA_ALUNO" && !aluno) { toast.err("Selecione o aluno para lançar na conta."); return; }
    const body: any = { caixaId: caixa.caixa?.id, tipo, desconto: Number(desconto) || 0, clienteNome: cliente || undefined, itens: cart.map((l) => ({ produtoId: l.id, quantidade: l.qtd })) };
    if (tipo === "A_VISTA") body.formaPagamento = forma; else { body.studentId = aluno; body.parcelas = Number(parcelas) || 1; }
    await toast.run(async () => {
      const v = await eduApi.post("/suprimentos/vendas", body);
      setUltima(v); setCart([]); setDesconto("0"); prods.reload(); onSold();
    }, "Venda registrada.");
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" }, gap: 2 }}>
      <Panel title="Produtos" actions={<Box sx={{ display: "flex", gap: 1 }}>
        <TextField size="small" placeholder="Buscar produto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <TextField select size="small" label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} sx={{ minWidth: 140 }}><MenuItem value="">Todos</MenuItem>{CANAIS.map((c) => <MenuItem key={c} value={c}>{c.replace(/_/g, " ")}</MenuItem>)}</TextField>
      </Box>}>
        <Async state={prods}>
          {(d) => (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
              {itemsOf(d).map((p: any) => (
                <Card key={p.id} variant="outlined" sx={{ opacity: p.estoque <= 0 ? 0.5 : 1 }}>
                  <CardActionArea disabled={p.estoque <= 0} onClick={() => add(p)}>
                    <CardContent>
                      <Typography variant="body2" sx={{ fontWeight: 700, minHeight: 40 }}>{p.nome}</Typography>
                      <Typography variant="h6" color="primary" sx={{ fontWeight: 800 }}>{brl(p.preco)}</Typography>
                      <Typography variant="caption" color={p.estoque <= 0 ? "error" : "text.secondary"}>{p.estoque <= 0 ? "Sem estoque" : `${num(p.estoque, 0)} em estoque`}</Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
              {!itemsOf(d).length && <Typography color="text.secondary">Nenhum produto cadastrado para venda. Use a aba "Produtos".</Typography>}
            </Box>
          )}
        </Async>
      </Panel>
      <Panel title="Venda atual">
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {cart.map((l) => (
            <Box key={l.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>{l.nome}</Typography>
              <IconButton size="small" onClick={() => mudar(l.id, -1)}><RemoveIcon fontSize="small" /></IconButton>
              <Typography sx={{ minWidth: 24, textAlign: "center" }}>{l.qtd}</Typography>
              <IconButton size="small" onClick={() => mudar(l.id, 1)} disabled={l.qtd >= l.estoque}><AddIcon fontSize="small" /></IconButton>
              <Typography variant="body2" sx={{ minWidth: 80, textAlign: "right", fontWeight: 700 }}>{brl(l.preco * l.qtd)}</Typography>
            </Box>
          ))}
          {!cart.length && <Typography color="text.secondary">Toque nos produtos para adicionar.</Typography>}
          <TextField select size="small" label="Tipo de venda" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <MenuItem value="A_VISTA">À vista</MenuItem><MenuItem value="LANCADA_ALUNO">Lançar na conta do aluno</MenuItem>
          </TextField>
          {tipo === "A_VISTA" ? (
            <TextField select size="small" label="Forma de pagamento" value={forma} onChange={(e) => setForma(e.target.value)}><MenuItem value="DINHEIRO">Dinheiro</MenuItem><MenuItem value="PIX">PIX</MenuItem><MenuItem value="CARTAO">Cartão</MenuItem></TextField>
          ) : (
            <Box sx={{ display: "grid", gap: 1 }}>
              <Box sx={{ display: "flex", gap: 1 }}><TextField size="small" label="Buscar aluno (nome ou RA)" value={alunoBusca} onChange={(e) => setAlunoBusca(e.target.value)} sx={{ flex: 1 }} /><Button onClick={buscarAluno}>Buscar</Button></Box>
              {achados.length > 0 && <TextField select size="small" label="Resultado" value={aluno} onChange={(e) => setAluno(e.target.value)}>{achados.map((a) => <MenuItem key={a.id} value={a.id}>{a.nomeCompleto} {a.ra ? `(${a.ra})` : ""}</MenuItem>)}</TextField>}
              <TextField size="small" label="ID do aluno" value={aluno} onChange={(e) => setAluno(e.target.value)} helperText="Preenchido ao escolher o resultado da busca" />
              <TextField size="small" type="number" label="Parcelas" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
            </Box>
          )}
          <TextField size="small" label="Cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          <TextField size="small" type="number" label="Desconto (R$)" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><Typography>Subtotal {brl(subtotal)}</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{brl(total)}</Typography></Box>
          <Button variant="contained" size="large" color="success" onClick={finalizar} disabled={!cart.length}>Finalizar venda</Button>
          {ultima && <Alert severity="success" action={<Button size="small" onClick={() => toast.run(() => openHtml(`/suprimentos/vendas/${ultima.id}/recibo`), "Recibo aberto em nova aba.")}>Recibo</Button>}>Venda {ultima.numero} concluída: {brl(ultima.total)}</Alert>}
        </Box>
      </Panel>
      {toast.node}
    </Box>
  );
}

export function CaixaPanel({ caixa, reload }: { caixa: any; reload: () => void }) {
  const toast = useToast();
  const [mov, setMov] = useState({ tipo: "SANGRIA", valor: "", motivo: "" });
  const [contado, setContado] = useState("");
  const c = caixa.caixa;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <StatGrid>
        <Stat label="Abertura" value={brl(c.valorAbertura)} /><Stat label="Vendas" value={num(caixa.vendas, 0)} hint={brl(caixa.totalVendido)} />
        <Stat label="Lançado em contas de alunos" value={brl(caixa.lancadoAlunos)} /><Stat label="Dinheiro esperado" value={brl(caixa.dinheiroEsperado)} tone="success" />
        <Stat label="Sangrias / Suprimentos" value={`${brl(caixa.sangrias)} / ${brl(caixa.suprimentos)}`} />
      </StatGrid>
      <Panel title="Por forma de pagamento">
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{Object.entries(caixa.porFormaPagamento || {}).map(([k, v]: any) => <Typography key={k}><b>{k}</b>: {brl(v)}</Typography>)}{!Object.keys(caixa.porFormaPagamento || {}).length && <Typography color="text.secondary">Sem vendas à vista ainda.</Typography>}</Box>
      </Panel>
      <Panel title="Movimento de caixa" subtitle="Sangria (retirada) ou suprimento (reforço de troco)">
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField select size="small" label="Tipo" value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })} sx={{ minWidth: 150 }}><MenuItem value="SANGRIA">Sangria</MenuItem><MenuItem value="SUPRIMENTO">Suprimento</MenuItem></TextField>
          <TextField size="small" type="number" label="Valor (R$)" value={mov.valor} onChange={(e) => setMov({ ...mov, valor: e.target.value })} />
          <TextField size="small" label="Motivo" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} sx={{ minWidth: 220 }} />
          <Button variant="outlined" onClick={() => toast.run(() => eduApi.post(`/suprimentos/caixa/${c.id}/movimento`, { tipo: mov.tipo, valor: Number(mov.valor), motivo: mov.motivo || undefined }), "Movimento registrado.", () => { setMov({ ...mov, valor: "", motivo: "" }); reload(); })}>Registrar</Button>
        </Box>
      </Panel>
      <Panel title="Fechamento de caixa" subtitle="Conte o dinheiro em caixa e informe o valor para conferir a diferença.">
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField size="small" type="number" label="Valor contado (R$)" value={contado} onChange={(e) => setContado(e.target.value)} />
          <Button variant="contained" color="error" disabled={contado === ""} onClick={() => toast.run(async () => { const r = await eduApi.post(`/suprimentos/caixa/${c.id}/fechar`, { valorContado: Number(contado) }); toast.ok(`Caixa fechado. Diferença: ${brl(r.diferenca)}`); return r; }, "Caixa fechado.", reload, "Fechar o caixa agora?")}>Fechar caixa</Button>
        </Box>
      </Panel>
      {toast.node}
    </Box>
  );
}

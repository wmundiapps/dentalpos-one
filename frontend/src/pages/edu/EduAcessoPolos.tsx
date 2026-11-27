import { Alert, Autocomplete, Chip, Table, TableBody, TableCell, TableHead, TableRow, TextField } from "@mui/material";
import EduShell from "../../edu/EduShell";
import { eduApi } from "../../services/EduApi";
import { Section, StateBox, useLoad, useToast } from "../../edu/admissoes/common";

/** Define quais polos cada gestor pode ver (um ou mais). Sem polo marcado = vê todos. */
export default function EduAcessoPolos() {
  const { data, loading, error, reload } = useLoad<any>("/acesso-polos");
  const { setMsg, node } = useToast();
  async function salvar(userId: string, poloIds: string[]) { try { await eduApi.put(`/acesso-polos/usuarios/${userId}`, { poloIds }); setMsg({ type: "success", text: "Polos do gestor atualizados." }); reload(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } }
  const polos: any[] = data?.polos ?? [];
  return (
    <EduShell title="Acesso por polo" subtitle="Cada gestor pode ter um ou mais polos. Quem tem polos definidos só enxerga os dados deles; sem nenhum polo marcado, vê a rede inteira.">
      <Alert severity="info" sx={{ mb: 2 }}>Administração e reitoria sempre veem todos os polos. A restrição vale para as telas de polos e rede EAD.</Alert>
      <StateBox loading={loading} error={error} onRetry={reload} empty={data && !polos.length} emptyText="Cadastre polos em Polos EAD para atribuir aos gestores.">
        <Section title="Gestores e seus polos">
          <Table size="small"><TableHead><TableRow><TableCell>Usuário</TableCell><TableCell>Cargo</TableCell><TableCell sx={{ minWidth: 380 }}>Polos com acesso</TableCell></TableRow></TableHead>
            <TableBody>{data?.usuarios.map((u: any) => (
              <TableRow key={u.id}><TableCell>{u.nome}<br /><small>{u.email}</small></TableCell><TableCell><Chip size="small" label={u.cargo} /></TableCell>
                <TableCell><Autocomplete multiple size="small" options={polos} getOptionLabel={(p: any) => `${p.nome}${p.cidade ? ` — ${p.cidade}/${p.uf}` : ""}`} value={polos.filter((p) => u.poloIds.includes(p.id))} onChange={(_, v) => salvar(u.id, v.map((p: any) => p.id))} renderInput={(params) => <TextField {...params} placeholder={u.poloIds.length ? "" : "Todos os polos"} />} /></TableCell></TableRow>))}</TableBody></Table>
        </Section>
      </StateBox>
      {node}
    </EduShell>
  );
}

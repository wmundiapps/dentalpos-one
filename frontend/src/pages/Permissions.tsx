import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { AccessApi, type AccessProfile, type AccessUser, type PermissionItem } from "../services/AccessApi";

const PROFILE_NAMES: Record<string, string> = {
  DENTISTA: "Dentista", AUXILIAR: "Auxiliares", RECEPCAO: "Recepção", FINANCEIRO: "Financeiro", ADMINISTRACAO: "Administração",
  LABORATORIO: "Laboratório", CONTADOR: "Contador", JURIDICO: "Jurídico", GESTOR: "Gestor", RH: "Recursos Humanos", ADMIN: "Administrador (Master)",
};
const PROFILE_ORDER = ["DENTISTA", "AUXILIAR", "RECEPCAO", "FINANCEIRO", "ADMINISTRACAO", "LABORATORIO", "CONTADOR", "JURIDICO", "GESTOR", "RH", "ADMIN"];
const MODULE_NAMES: Record<string, string> = {
  dashboard: "Painel inicial", agenda: "Agenda e painel de atendimentos", patients: "Pacientes", clinical: "Clínico / prontuário", laboratory: "Laboratório",
  design: "DentalPos Design", finance: "Financeiro", accounting: "Contabilidade", hr: "Recursos humanos", sales: "Vendas", marketing: "Marketing e Revah",
  documents: "Documentos", settings: "Configurações (inclui importar pacientes)", users: "Usuários e permissões", audit: "Auditoria",
};
const ACTION_NAMES: Record<string, string> = {
  view: "Ver", create: "Criar", edit: "Editar", cancel: "Cancelar", approve: "Aprovar", values: "Ver valores", sensitive: "Dados sensíveis",
  send: "Enviar", portal: "Portal do contador", manage: "Gerenciar",
};

const profileName = (p: AccessProfile) => PROFILE_NAMES[p.code] || p.name;

export default function Permissions() {
  const [catalog, setCatalog] = useState<PermissionItem[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [profileId, setProfileId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // Garante que os perfis padrão existam (não altera perfis já personalizados).
      await AccessApi.bootstrap().catch(() => undefined);
      const [c, p, u] = await Promise.all([AccessApi.catalog(), AccessApi.profiles(), AccessApi.users()]);
      setCatalog(c);
      setProfiles(p.sort((a, b) => PROFILE_ORDER.indexOf(a.code) - PROFILE_ORDER.indexOf(b.code)));
      setUsers(u);
      setProfileId((current) => current || p.find((x) => x.code !== "ADMIN")?.id || p[0]?.id || "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar permissões.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const profile = profiles.find((p) => p.id === profileId);
  useEffect(() => {
    setChecked(new Set(profile?.permissions.map((x) => x.permission.code) || []));
  }, [profile]);

  const modules = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const item of catalog) map.set(item.module, [...(map.get(item.module) || []), item]);
    return [...map.entries()];
  }, [catalog]);

  const locked = profile?.code === "ADMIN";

  const toggle = (code: string) => {
    const next = new Set(checked);
    if (next.has(code)) next.delete(code); else next.add(code);
    setChecked(next);
  };

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await AccessApi.setPermissions(profile.id, [...checked]);
      setNotice(`Permissões do perfil ${profileName(profile)} salvas.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const changeUser = async (user: AccessUser, id: string, add: boolean) => {
    setError("");
    try {
      if (add) await AccessApi.assign(user.id, id); else await AccessApi.unassign(user.id, id);
      setUsers(await AccessApi.users());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar o perfil do usuário.");
    }
  };

  return (
    <Box>
      <PageHeader title="Permissões de acesso" description="Escolha um perfil ou departamento e marque o que cada função do sistema pode fazer. O Administrador (Master) sempre tem acesso total." />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
          <TextField select label="Perfil / departamento" value={profileId} onChange={(e) => setProfileId(e.target.value)} sx={{ minWidth: 260 }}>
            {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{profileName(p)}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={busy || locked || !profile} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar permissões"}</Button>
          {locked && <Chip color="warning" label="Perfil Master: acesso total, não editável" />}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {modules.map(([module, items]) => (
            <Paper key={module} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{MODULE_NAMES[module] || module}</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2 }}>
                {items.map((item) => (
                  <FormControlLabel
                    key={item.code}
                    control={<Checkbox size="small" checked={locked || checked.has(item.code)} disabled={locked} onChange={() => toggle(item.code)} />}
                    label={ACTION_NAMES[item.action] || item.action}
                  />
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>Perfis de cada usuário</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Clique em um perfil para retirá-lo do usuário ou escolha outro na lista para acrescentar.</Typography>
        {users.map((user) => {
          const assigned = profiles.filter((p) => user.profileIds.includes(p.id));
          const available = profiles.filter((p) => !user.profileIds.includes(p.id));
          return (
            <Box key={user.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center", py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{`${user.firstName} ${user.lastName}`.trim() || user.email}</Typography>
                <Typography variant="body2" color="text.secondary">{user.role === "ADMIN" ? `${user.email} • Administrador (acesso total)` : user.email}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                {assigned.map((p) => <Chip key={p.id} label={profileName(p)} onDelete={() => void changeUser(user, p.id, false)} />)}
                <TextField select size="small" label="Acrescentar perfil" value="" onChange={(e) => void changeUser(user, e.target.value, true)} sx={{ minWidth: 180 }}>
                  {available.map((p) => <MenuItem key={p.id} value={p.id}>{profileName(p)}</MenuItem>)}
                </TextField>
              </Box>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}

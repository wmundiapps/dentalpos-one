import { useCallback, useEffect, useMemo, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Chip, FormControlLabel, List, ListItemButton, ListItemText, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PageHeader from "../components/PageHeader";
import { navigationGroups } from "../config/navigation";
import { defaultMenuCodes, menuCode, resetMenuAccess } from "../config/menuAccess";
import { AccessApi, type AccessProfile, type AccessUser, type PermissionItem } from "../services/AccessApi";

const PROFILE_NAMES: Record<string, string> = {
  DENTISTA: "Dentista", AUXILIAR: "Auxiliares", RECEPCAO: "Recepção", FINANCEIRO: "Financeiro", ADMINISTRACAO: "Administração",
  LABORATORIO: "Laboratório", CONTADOR: "Contabilidade", JURIDICO: "Jurídico", GESTOR: "Gestor", RH: "Recursos Humanos", ADMIN: "Administrador (Master)",
  MARKETING: "Marketing", VENDAS: "Vendas", MARKETPLACE: "Marketplace", COMPRAS: "Compras e estoque", EDUCACIONAL: "Educacional",
};
PROFILE_NAMES.DENTISTA = "Clínico (dentistas)"; PROFILE_NAMES.ADMINISTRACAO = "Administração / Escritório";
const PROFILE_ORDER = ["ADMIN", "GESTOR", "ADMINISTRACAO", "RH", "RECEPCAO", "DENTISTA", "AUXILIAR", "LABORATORIO", "FINANCEIRO", "CONTADOR", "JURIDICO", "MARKETING", "VENDAS", "MARKETPLACE", "COMPRAS", "EDUCACIONAL"];

// Itens do menu na mesma ordem do menu lateral (um item que aparece em dois grupos entra só no primeiro).
const MENU_GROUPS = (() => {
  const seen = new Set<string>();
  const all = navigationGroups.map((g) => ({ label: g.label, items: g.items.filter((it) => { if (seen.has(it.path)) return false; seen.add(it.path); return true; }) })).filter((g) => g.items.length > 0);
  return all;
})();
const ALL_ITEMS = MENU_GROUPS.flatMap((g) => g.items);
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
  const [suggested, setSuggested] = useState(false);
  useEffect(() => {
    const codes = profile?.permissions.map((x) => x.permission.code) || [];
    const next = new Set(codes);
    const configured = codes.some((c) => c.startsWith("menu."));
    // Departamento ainda não configurado: pré-marca o que ele já enxerga hoje, para o "Salvar" não tirar nada sem querer.
    if (profile && profile.code !== "ADMIN" && !configured) {
      const viewModules = codes.filter((c) => c.endsWith(".view")).map((c) => c.split(".")[0]);
      defaultMenuCodes(ALL_ITEMS, viewModules).forEach((c) => next.add(c));
      setSuggested(true);
    } else setSuggested(false);
    setChecked(next);
  }, [profile]);

  const modules = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const item of catalog.filter((c) => c.module !== "menu")) map.set(item.module, [...(map.get(item.module) || []), item]);
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
      setNotice(`Acessos do departamento ${profileName(profile)} salvos.`);
      resetMenuAccess();
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
      <PageHeader title="Permissões de acesso" description="Escolha o departamento e marque o que ele pode abrir no sistema. O Administrador (Master) sempre tem acesso total." />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px 1fr" }, gap: 2, mb: 3, alignItems: "start" }}>
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Typography sx={{ fontWeight: 800, p: 2, pb: 1 }}>Departamentos</Typography>
          <List dense disablePadding>
            {profiles.map((p) => (
              <ListItemButton key={p.id} selected={p.id === profileId} onClick={() => setProfileId(p.id)}>
                <ListItemText primary={profileName(p)} secondary={`${p._count?.users ?? 0} usuário(s)`} slotProps={{ primary: { sx: { fontWeight: p.id === profileId ? 800 : 600 } } }} />
              </ListItemButton>
            ))}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, flex: 1 }}>{profile ? profileName(profile) : "Escolha um departamento"}</Typography>
            <Button variant="contained" disabled={busy || locked || !profile} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar acessos"}</Button>
          </Box>
          {locked && <Chip color="warning" label="Perfil Master: acesso total, não editável" sx={{ mb: 1 }} />}
          {suggested && !locked && <Alert severity="info" sx={{ mb: 2 }}>Este departamento ainda não foi configurado. Já marquei o que ele vê hoje. Ajuste e clique em Salvar acessos.</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Marque o que este departamento pode abrir no sistema, na mesma ordem do menu lateral. Só o administrador e o gestor mudam estes acessos.</Typography>
          <Box sx={{ display: "grid", gap: 2 }}>
            {MENU_GROUPS.map((group) => {
              const codes = group.items.map((it) => menuCode(it.path));
              const all = locked || codes.every((c) => checked.has(c));
              const some = !all && codes.some((c) => checked.has(c));
              const setGroup = (on: boolean) => { const next = new Set(checked); codes.forEach((c) => (on ? next.add(c) : next.delete(c))); setChecked(next); };
              return (
                <Paper key={group.label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <FormControlLabel
                    control={<Checkbox checked={all} indeterminate={some} disabled={locked} onChange={(_, v) => setGroup(v)} />}
                    label={<Typography sx={{ fontWeight: 900 }}>{group.label}</Typography>}
                  />
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2, pl: 3 }}>
                    {group.items.map((it) => (
                      <FormControlLabel
                        key={it.path}
                        control={<Checkbox size="small" checked={locked || checked.has(menuCode(it.path))} disabled={locked} onChange={() => toggle(menuCode(it.path))} />}
                        label={it.label}
                      />
                    ))}
                  </Box>
                </Paper>
              );
            })}
          </Box>

          <Accordion disableGutters variant="outlined" sx={{ mt: 3, borderRadius: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ fontWeight: 800 }}>Ações avançadas (criar, editar, aprovar, ver valores)</Typography></AccordionSummary>
            <AccordionDetails>
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
            </AccordionDetails>
          </Accordion>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>O que cada usuário pode ver</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Resumo do que cada pessoa enxerga hoje, somando os perfis dela. Para mudar, ajuste as permissões do perfil acima ou troque os perfis do usuário abaixo.</Typography>
        {users.map((user) => {
          const isMaster = user.role === "ADMIN";
          const seen = new Set<string>();
          for (const p of profiles.filter((x) => user.profileIds.includes(x.id))) for (const x of p.permissions) if (x.permission.code.endsWith(".view")) seen.add(x.permission.code.split(".")[0]);
          const visible = Object.keys(MODULE_NAMES).filter((m) => isMaster || seen.has(m));
          const hidden = Object.keys(MODULE_NAMES).filter((m) => !isMaster && !seen.has(m));
          return (
            <Box key={user.id} sx={{ py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700 }}>{`${user.firstName} ${user.lastName}`.trim() || user.email}{isMaster ? " — Administrador (vê tudo)" : ""}</Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                {visible.map((m) => <Chip key={m} size="small" color="success" variant="outlined" label={MODULE_NAMES[m]} />)}
                {hidden.map((m) => <Chip key={m} size="small" variant="outlined" label={`Sem acesso: ${MODULE_NAMES[m]}`} sx={{ opacity: 0.6 }} />)}
              </Box>
            </Box>
          );
        })}
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

import { APP_NAME, EDU_ONLY } from "../config/appMode";
import {
  Avatar, Box, Collapse, Divider, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Tooltip, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button
} from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import SchoolIcon from "@mui/icons-material/School";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import BrandName from "./BrandName";
import AlertasMenu from "../edu/alertas/AlertasMenu";
import { appConfig } from "../config/app";
import { navigationGroups, SETORES } from "../config/navigation";
import { eduApi } from "../services/EduApi";
import { ajudaDoItem, groupHelp } from "../config/menuHelp";
import MenuHelp from "./MenuHelp";
import { rotaBloqueada, useModulosBloqueados } from "../edu/acesso/modulos";
import {
  getDemoModuleStatus,
  readDemoAccess,
  readSessionUser,
  demoSalesUrl,
  publicBookingUrl,
} from "../services/DemoAccess";

const OPEN_SETOR_KEY = "edumaster.menu.setor-aberto.v1";
const POS = ["POS_LATO","POS_STRICTO"];
type CursoMenu = { id: string; nome: string; modalidade: string; nivel: string; origem: "curso"|"pos" };
function cursosDoSetor(todos:CursoMenu[],tipo:string):CursoMenu[]{
  const ead=(c:CursoMenu)=>String(c.modalidade).toUpperCase()==="EAD";
  const pos=(c:CursoMenu)=>c.origem==="pos"||POS.includes(c.nivel);
  if(tipo==="grad-presencial")return todos.filter(c=>!pos(c)&&!ead(c));
  if(tipo==="grad-ead")return todos.filter(c=>!pos(c)&&ead(c));
  if(tipo==="pos-presencial")return todos.filter(c=>pos(c)&&!ead(c));
  return todos.filter(c=>pos(c)&&ead(c));
}
const OPEN_GROUPS_KEY = "dentalpos.navigation.open-groups.v2";
const COLLAPSED_KEY = "dentalpos.navigation.collapsed.v2";
const AGENDAMENTO_ONLINE_PATH = "/agendamento-online";

function pathMatches(target:string, pathname:string, search:string){
  const [targetPath,query=""]=target.split("?");
  if(targetPath!==pathname)return false;
  if(!query)return true;
  const t=new URLSearchParams(query), c=new URLSearchParams(search);
  return Array.from(t.entries()).every(([k,v])=>c.get(k)===v);
}

export default function Sidebar(){
  const navigate=useNavigate();
  const location=useLocation();
  const demo=readDemoAccess();
  const sessionUser=readSessionUser();
  const isDesign=location.pathname==="/design"||location.pathname.startsWith("/design/");
  const [collapsed,setCollapsed]=useState(()=>{
    if(isDesign)return true;
    const saved=localStorage.getItem(COLLAPSED_KEY);
    return saved===null ? true : saved==="1"; // compacto por padrão
  });
  const [showInDevelopment,setShowInDevelopment]=useState(false);

  // No EXPERIENCE, nenhum item deve desaparecer do menu — apenas deduplicado.
  const modulosBloqueados=useModulosBloqueados(); // acesso por cargo: esconde o que o cargo não pode abrir
  const cargoLogado=String(sessionUser?.role||"").toUpperCase();
  const visibleGroups=useMemo(()=>{
    const seen=new Set<string>();
    // EduMaster: aluno e professor só veem as telas do seu papel (o servidor também bloqueia o resto).
    const role=String(sessionUser?.role||"").toUpperCase();
    const alunoOk=["/edu/portal-aluno","/edu/minha-biometria","/edu/exames","/edu/inicio"];
    const profOk=[...alunoOk,"/edu/biblioteca","/edu/portal-professor","/edu/calendario","/edu/notas","/edu/presenca","/edu/desempenho"];
    const permitidos=EDU_ONLY?(role==="STUDENT"?alunoOk:role==="TEACHER"?profOk:role==="CLIENTE_CONTABIL"?["/edu/contabil/portal"]:null):null;
    return navigationGroups.map(group=>{
      const items=group.items.filter(it=>{
        if(it.roles&&!it.roles.includes(cargoLogado))return false;
        if(rotaBloqueada(it.path,modulosBloqueados))return false;
        if(permitidos&&!permitidos.some(pp=>it.path.split("?")[0]===pp))return false;
        if(group.atalho)return true; // atalhos repetem telas de outros grupos dentro do setor
        const dedupeKey=it.path;
        if(seen.has(dedupeKey))return false;
        seen.add(dedupeKey);
        return true;
      });
      return {...group,items};
    }).filter(g=>g.items.length>0);
  },[modulosBloqueados,cargoLogado]);

  const activeGroup=useMemo(
    ()=>visibleGroups.find(g=>g.items.some(it=>pathMatches(it.path,location.pathname,location.search)))?.label,
    [location.pathname,location.search,visibleGroups]
  );

  const [openGroups,setOpenGroups]=useState<Record<string,boolean>>(()=>{
    try{return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY)||"") as Record<string,boolean>;}
    catch{return {};}
  });

  const [setorAberto,setSetorAberto]=useState<string>(()=>{try{return localStorage.getItem(OPEN_SETOR_KEY)||"";}catch{return "";}});
  const [cursos,setCursos]=useState<CursoMenu[]>([]);
  useEffect(()=>{
    if(!EDU_ONLY)return;
    const norm=(r:any):any[]=>Array.isArray(r)?r:(r?.items||[]);
    Promise.all([
      eduApi.get<any>("/academico/cursos").then(norm).catch(()=>[]),
      eduApi.get<any>("/modalidades/pos/programas").then(norm).catch(()=>[]),
    ]).then(([c,p])=>setCursos([
      ...c.map((x:any):CursoMenu=>({id:x.id,nome:x.nome,modalidade:x.modalidade,nivel:x.perfil?.nivel||"GRADUACAO",origem:"curso"})),
      ...p.map((x:any):CursoMenu=>({id:x.id,nome:x.nome,modalidade:x.modalidade||"EAD",nivel:x.nivel||"POS_LATO",origem:"pos"})),
    ]));
  },[]);
  useEffect(()=>{try{localStorage.setItem(OPEN_SETOR_KEY,setorAberto)}catch{}},[setorAberto]);
  useEffect(()=>{if(isDesign)setCollapsed(true)},[isDesign]);
  // Botão de menu (hambúrguer) do topo: abre/fecha o menu lateral.
  useEffect(()=>{const h=()=>setCollapsed(v=>!v);window.addEventListener("edu:toggle-menu",h);return()=>window.removeEventListener("edu:toggle-menu",h)},[]);
  useEffect(()=>{localStorage.setItem(COLLAPSED_KEY,collapsed?"1":"0")},[collapsed]);
  useEffect(()=>{
    if(activeGroup)setOpenGroups({[activeGroup]:true}); // somente um grupo aberto
    const g=visibleGroups.find(x=>x.label===activeGroup);
    if(EDU_ONLY&&g?.setor)setSetorAberto(g.setor);
  },[activeGroup,visibleGroups]);
  useEffect(()=>{localStorage.setItem(OPEN_GROUPS_KEY,JSON.stringify(openGroups))},[openGroups]);

  const sidebarWidth=collapsed?58:224;
  const initials=`${sessionUser?.firstName?.[0]||""}${sessionUser?.lastName?.[0]||""}`.toUpperCase()||(EDU_ONLY?"EM":"DP");
  const displayName=[sessionUser?.firstName,sessionUser?.lastName].filter(Boolean).join(" ")||"Usuário";
  const roleLabel=demo?.isDemo?"Demo / Administrador":sessionUser?.role||"Usuário";

  function isInDevelopment(path:string):boolean{
    if(!demo?.isDemo)return false;
    const pathname=path.split("?")[0]||"/";
    return getDemoModuleStatus(pathname,demo)==="EM_DESENVOLVIMENTO";
  }

  function handleItemClick(path:string){
    // Rota pública tratada fora do React Router (ver App.tsx) — precisa de navegação de
    // página inteira, com o clinicId incluído na URL para a página pública saber qual clínica.
    if(path.split("?")[0]===AGENDAMENTO_ONLINE_PATH){
      window.location.href=publicBookingUrl(sessionUser?.clinicId);
      return;
    }
    if(isInDevelopment(path)){
      setShowInDevelopment(true);
      return;
    }
    navigate(path);
  }

  function handleGroupClick(group:typeof visibleGroups[number]){
    const current=group.items.find(i=>pathMatches(i.path,location.pathname,location.search));
    handleItemClick((current||group.items[0]).path);
  }

  const renderGrupo=(group:typeof visibleGroups[number],plano?:boolean)=>{
        const selected=group.items.some(i=>pathMatches(i.path,location.pathname,location.search));
        const open=Boolean(openGroups[group.label]);

        if(collapsed){
          return <Tooltip key={group.label} title={group.label} placement="right" arrow>
            <ListItemButton onClick={()=>handleGroupClick(group)} selected={selected} sx={{
              mb:.3,minHeight:42,borderRadius:2,justifyContent:"center",px:.5,color:selected?"#fff":"#CBD5E1",
              "&.Mui-selected":{bgcolor:"#1976D2"},"&:hover":{bgcolor:"#1E293B",color:"#fff"}
            }}>
              <ListItemIcon sx={{color:"inherit",minWidth:0,justifyContent:"center"}}>{group.icon}</ListItemIcon>
            </ListItemButton>
          </Tooltip>
        }

        // Grupo com um único item (ex.: Laboratório) vira um botão direto, sem submenu.
        if(group.items.length===1){
          const only=group.items[0];
          return <Box key={group.label} sx={{mb:.25}}>
            <ListItemButton onClick={()=>handleItemClick(only.path)} selected={selected} sx={{
              borderRadius:2,minHeight:39,color:selected?"#fff":"#CBD5E1",
              "&.Mui-selected":{bgcolor:"#1976D2",color:"#fff"},"&:hover":{bgcolor:"#1E293B",color:"#fff"}
            }}>
              <ListItemIcon sx={{color:"inherit",minWidth:34}}>{group.icon}</ListItemIcon>
              <ListItemText primary={<Typography component="span" sx={{fontWeight:selected?800:700,fontSize:13}}>{group.label}</Typography>}/>
              <MenuHelp titulo={group.label} ajuda={ajudaDoItem(only.path,only.label)}/>
            </ListItemButton>
          </Box>
        }

        return <Box key={group.label} sx={{mb:.25}}>
          {!plano&&<ListItemButton onClick={()=>setOpenGroups(open?{}:{[group.label]:true})} sx={{
            borderRadius:2,minHeight:39,color:selected?"#fff":"#CBD5E1",
            bgcolor:selected?"rgba(25,118,210,.16)":"transparent","&:hover":{bgcolor:"#1E293B"}
          }}>
            <ListItemIcon sx={{color:"inherit",minWidth:34}}>{group.icon}</ListItemIcon>
            <ListItemText primary={<Typography component="span" sx={{fontWeight:selected?800:700,fontSize:13}}>{group.label}</Typography>}/>
            {groupHelp[group.label]&&<MenuHelp titulo={group.label} ajuda={groupHelp[group.label]}/>}
            {open?<ExpandLessIcon fontSize="small"/>:<ExpandMoreIcon fontSize="small"/>}
          </ListItemButton>}
          <Collapse in={open||Boolean(plano)} timeout="auto" unmountOnExit>
            <List disablePadding sx={{pl:.5}}>
              {group.items.map(it=>{
                const active=pathMatches(it.path,location.pathname,location.search);
                const inProgress=isInDevelopment(it.path);
                return <ListItemButton key={it.path} selected={active} onClick={()=>handleItemClick(it.path)} sx={{
                  minHeight:36,borderRadius:2,my:.15,pl:1.5,color:active?"#fff":"#94A3B8",
                  "&.Mui-selected":{bgcolor:"#1976D2",color:"#fff"},"&:hover":{bgcolor:"#1E293B",color:"#fff"}
                }}>
                  <ListItemIcon sx={{color:"inherit",minWidth:30}}>{it.icon}</ListItemIcon>
                  <ListItemText primary={<Typography component="span" sx={{fontSize:12.5}}>{it.label}</Typography>}/>
                  <MenuHelp titulo={it.label} ajuda={ajudaDoItem(it.path,it.label)}/>
                  {inProgress&&<Tooltip title="Em desenvolvimento"><ConstructionOutlinedIcon sx={{fontSize:15,color:"#94A3B8",ml:.5}}/></Tooltip>}
                </ListItemButton>
              })}
            </List>
          </Collapse>
        </Box>
      };

  const daysRemaining=demo?.daysRemaining??0;

  return <Box component="aside" sx={{
    width:sidebarWidth,minWidth:sidebarWidth,height:"100vh",bgcolor:"#0F172A",color:"#fff",
    display:"flex",flexDirection:"column",position:"sticky",top:0,overflowY:"auto",overflowX:"visible",
    transition:"width .2s ease,min-width .2s ease",flexShrink:0
  }}>
    <Tooltip title={collapsed?"Expandir menu":"Recolher menu"} placement="right">
      <IconButton onClick={()=>setCollapsed(v=>!v)} size="small" sx={{
        position:"fixed",left:sidebarWidth-13,top:72,zIndex:1400,width:26,height:42,
        borderRadius:"0 10px 10px 0",bgcolor:"#0F172A",color:"#fff",border:"1px solid #334155",
        transition:"left .2s ease","&:hover":{bgcolor:"primary.main"}
      }}>
        {collapsed?<MenuIcon fontSize="small"/>:<MenuOpenIcon fontSize="small"/>}
      </IconButton>
    </Tooltip>

    <Box sx={{px:collapsed?.5:1.5,pt:1.2,pb:1,textAlign:"center"}}>
      <Avatar sx={{width:collapsed?34:48,height:collapsed?34:48,mx:"auto",mb:collapsed?0:.8,bgcolor:"primary.main",fontSize:14}}>
        {initials}
      </Avatar>
      {!collapsed&&<>
        <Typography sx={{fontWeight:800,fontSize:14,lineHeight:1.2}}>{displayName}</Typography>
        <Typography sx={{color:"#94A3B8",fontSize:11}}>{roleLabel}</Typography>
      </>}
    </Box>
    <Divider sx={{borderColor:"#334155"}}/>
    {EDU_ONLY&&<><AlertasMenu collapsed={collapsed} offsetLeft={sidebarWidth}/><Divider sx={{borderColor:"#334155"}}/></>}

    <List sx={{mt:.5,px:collapsed?.4:.7}}>
      {!EDU_ONLY&&visibleGroups.map(g=>renderGrupo(g))}
      {EDU_ONLY&&SETORES.map(setor=>{
        const grupos=visibleGroups.filter(g=>g.setor===setor.nome);
        const doSetor=setor.cursos?cursosDoSetor(cursos,setor.cursos):[];
        if(!grupos.length&&!doSetor.length)return null;
        const aberto=setorAberto===setor.nome;
        const ativo=grupos.some(g=>g.items.some(i=>pathMatches(i.path,location.pathname,location.search)));
        if(collapsed){
          return <Tooltip key={setor.nome} title={setor.nome} placement="right" arrow>
            <ListItemButton onClick={()=>{setCollapsed(false);setSetorAberto(setor.nome)}} selected={ativo} sx={{mb:.3,minHeight:42,borderRadius:2,justifyContent:"center",px:.5,color:ativo?"#fff":"#CBD5E1","&.Mui-selected":{bgcolor:"#1976D2"},"&:hover":{bgcolor:"#1E293B",color:"#fff"}}}>
              <ListItemIcon sx={{color:"inherit",minWidth:0,justifyContent:"center"}}>{setor.icon}</ListItemIcon>
            </ListItemButton>
          </Tooltip>
        }
        return <Box key={setor.nome} sx={{mb:.4}}>
          <ListItemButton onClick={()=>setSetorAberto(aberto?"":setor.nome)} sx={{borderRadius:2,minHeight:42,color:ativo?"#fff":"#E2E8F0",bgcolor:aberto?"rgba(25,118,210,.18)":"transparent","&:hover":{bgcolor:"#1E293B"}}}>
            <ListItemIcon sx={{color:"inherit",minWidth:34}}>{setor.icon}</ListItemIcon>
            <ListItemText primary={<Typography component="span" sx={{fontWeight:800,fontSize:13.5,lineHeight:1.2}}>{setor.nome}</Typography>}/>
            {aberto?<ExpandLessIcon fontSize="small"/>:<ExpandMoreIcon fontSize="small"/>}
          </ListItemButton>
          <Collapse in={aberto} timeout="auto" unmountOnExit>
            <Box sx={{pl:.8,pt:.3,borderLeft:`2px solid ${setor.cor}66`,ml:1.4}}>
              {setor.cursos&&<Box sx={{mb:.5}}>
                <Typography sx={{fontSize:10.5,fontWeight:800,letterSpacing:.5,color:"#94A3B8",px:1,py:.4}}>CURSOS</Typography>
                {doSetor.length===0&&<Typography sx={{fontSize:12,color:"#64748B",px:1.5,pb:.5}}>Nenhum curso cadastrado neste setor.</Typography>}
                {doSetor.map(c=><ListItemButton key={c.origem+c.id} onClick={()=>handleItemClick(c.origem==="curso"?`/edu/academico/matrizes?programId=${c.id}`:"/edu/modalidades")} sx={{minHeight:34,borderRadius:2,my:.1,pl:1.5,color:"#CBD5E1","&:hover":{bgcolor:"#1E293B",color:"#fff"}}}>
                  <ListItemIcon sx={{color:"inherit",minWidth:28}}><SchoolIcon sx={{fontSize:17}}/></ListItemIcon>
                  <ListItemText primary={<Typography component="span" sx={{fontSize:12.5}}>{c.nome}</Typography>}/>
                </ListItemButton>)}
              </Box>}
              {grupos.map(g=>renderGrupo(g,grupos.length===1&&!setor.cursos))}
            </Box>
          </Collapse>
        </Box>
      })}
    </List>

    <Box sx={{flexGrow:1}}/>

    {demo?.isDemo ? (
      collapsed ? (
        <Tooltip title={`${daysRemaining} dia${daysRemaining===1?"":"s"} restante${daysRemaining===1?"":"s"} — Assinar ${APP_NAME}`} placement="right">
          <IconButton
            onClick={()=>window.open(demoSalesUrl(),"_blank")}
            size="small"
            sx={{
              mx:"auto",mb:1.5,width:34,height:34,borderRadius:"50%",
              bgcolor:"#1976D2",color:"#fff","&:hover":{bgcolor:"#1565C0"}
            }}
          >
            <Typography sx={{fontSize:11,fontWeight:800}}>{daysRemaining}</Typography>
          </IconButton>
        </Tooltip>
      ) : (
        <Box sx={{mx:1,mb:1.5,p:1.5,borderRadius:2,bgcolor:"#1E293B",border:"1px solid #334155"}}>
          <Typography sx={{fontSize:10.5,color:"#94A3B8",fontWeight:800,letterSpacing:.4,mb:.4}}>
            MODO EXPERIENCE
          </Typography>
          <Typography sx={{fontSize:13,fontWeight:800,mb:1}}>
            {/* aviso */}{daysRemaining>0
              ? `${daysRemaining} dia${daysRemaining===1?"":"s"} restante${daysRemaining===1?"":"s"}`
              : "Período encerrado"}
          </Typography>
          <Button
            fullWidth
            size="small"
            variant="contained"
            href={demoSalesUrl()}
            sx={{fontSize:12,fontWeight:800,textTransform:"none"}}
          >
            Assinar {APP_NAME}
          </Button>
        </Box>
      )
    ) : (
      <Box sx={{py:1.2,textAlign:"center",color:"#64748B",whiteSpace:"nowrap"}}>
        {collapsed?<Typography sx={{fontSize:9,fontWeight:800}}>{EDU_ONLY?"EM":"DP"}</Typography>:
          <Typography sx={{fontSize:10.5}}><BrandName/> • {appConfig.version}</Typography>}
      </Box>
    )}

    <Dialog open={showInDevelopment} onClose={()=>setShowInDevelopment(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{fontWeight:800}}>Em desenvolvimento</DialogTitle>
      <DialogContent>
        <Typography>Esta funcionalidade está em desenvolvimento e será disponibilizada em breve no {APP_NAME}.</Typography>
      </DialogContent>
      <DialogActions sx={{px:3,pb:2}}>
        <Button onClick={()=>setShowInDevelopment(false)}>Voltar</Button>
      </DialogActions>
    </Dialog>
  </Box>
}
import {
  Avatar, Box, Collapse, Divider, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Tooltip, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button
} from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { navigationGroups } from "../config/navigation";
import {
  getDemoModuleStatus,
  readDemoAccess,
  readSessionUser,
  demoSalesUrl,
  publicBookingUrl,
} from "../services/DemoAccess";

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
  const visibleGroups=useMemo(()=>{
    const seen=new Set<string>();
    return navigationGroups.map(group=>{
      const items=group.items.filter(it=>{
        const dedupeKey=it.path;
        if(seen.has(dedupeKey))return false;
        seen.add(dedupeKey);
        return true;
      });
      return {...group,items};
    }).filter(g=>g.items.length>0);
  },[]);

  const activeGroup=useMemo(
    ()=>visibleGroups.find(g=>g.items.some(it=>pathMatches(it.path,location.pathname,location.search)))?.label,
    [location.pathname,location.search,visibleGroups]
  );

  const [openGroups,setOpenGroups]=useState<Record<string,boolean>>(()=>{
    try{return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY)||"") as Record<string,boolean>;}
    catch{return {};}
  });

  useEffect(()=>{if(isDesign)setCollapsed(true)},[isDesign]);
  useEffect(()=>{localStorage.setItem(COLLAPSED_KEY,collapsed?"1":"0")},[collapsed]);
  useEffect(()=>{
    if(activeGroup)setOpenGroups({[activeGroup]:true}); // somente um grupo aberto
  },[activeGroup]);
  useEffect(()=>{localStorage.setItem(OPEN_GROUPS_KEY,JSON.stringify(openGroups))},[openGroups]);

  const sidebarWidth=collapsed?58:224;
  const initials=`${sessionUser?.firstName?.[0]||""}${sessionUser?.lastName?.[0]||""}`.toUpperCase()||"DP";
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

    <List sx={{mt:.5,px:collapsed?.4:.7}}>
      {visibleGroups.map(group=>{
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

        return <Box key={group.label} sx={{mb:.25}}>
          <ListItemButton onClick={()=>setOpenGroups(open?{}:{[group.label]:true})} sx={{
            borderRadius:2,minHeight:39,color:selected?"#fff":"#CBD5E1",
            bgcolor:selected?"rgba(25,118,210,.16)":"transparent","&:hover":{bgcolor:"#1E293B"}
          }}>
            <ListItemIcon sx={{color:"inherit",minWidth:34}}>{group.icon}</ListItemIcon>
            <ListItemText primary={<Typography component="span" sx={{fontWeight:selected?800:700,fontSize:13}}>{group.label}</Typography>}/>
            {open?<ExpandLessIcon fontSize="small"/>:<ExpandMoreIcon fontSize="small"/>}
          </ListItemButton>
          <Collapse in={open} timeout="auto" unmountOnExit>
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
                  {inProgress&&<Tooltip title="Em desenvolvimento"><ConstructionOutlinedIcon sx={{fontSize:15,color:"#94A3B8",ml:.5}}/></Tooltip>}
                </ListItemButton>
              })}
            </List>
          </Collapse>
        </Box>
      })}
    </List>

    <Box sx={{flexGrow:1}}/>

    {demo?.isDemo ? (
      collapsed ? (
        <Tooltip title={`${daysRemaining} dia${daysRemaining===1?"":"s"} restante${daysRemaining===1?"":"s"} — Assinar DentalPos One`} placement="right">
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
            {daysRemaining>0
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
            Assinar DentalPos One
          </Button>
        </Box>
      )
    ) : (
      <Box sx={{py:1.2,textAlign:"center",color:"#64748B",whiteSpace:"nowrap"}}>
        {collapsed?<Typography sx={{fontSize:9,fontWeight:800}}>DP</Typography>:
          <Typography sx={{fontSize:10.5}}><BrandName/> • {appConfig.version}</Typography>}
      </Box>
    )}

    <Dialog open={showInDevelopment} onClose={()=>setShowInDevelopment(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{fontWeight:800}}>Em desenvolvimento</DialogTitle>
      <DialogContent>
        <Typography>Esta funcionalidade está em desenvolvimento e será disponibilizada em breve no DentalPos One.</Typography>
      </DialogContent>
      <DialogActions sx={{px:3,pb:2}}>
        <Button onClick={()=>setShowInDevelopment(false)}>Voltar</Button>
      </DialogActions>
    </Dialog>
  </Box>
}
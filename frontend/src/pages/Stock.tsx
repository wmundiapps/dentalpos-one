import { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Paper, Stack, TextField, Typography
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { ReactNode } from "react";
import PageHeader from "../components/PageHeader";
import { inventoryItems as seedItems } from "../services/InventoryService";
import type { InventoryItem, InventoryStatus } from "../types/inventory";

const KEY="dentalpos.inventory.items.v2";
const load=():InventoryItem[]=>{try{return JSON.parse(localStorage.getItem(KEY)||"null")||seedItems}catch{return seedItems}};
const statusOf=(q:number,min:number):InventoryStatus=>q<=Math.max(1,Math.floor(min*.35))?"Crítico":q<=min?"Estoque baixo":"Normal";
const brl=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);

export default function Stock(){
  const [items,setItems]=useState<InventoryItem[]>(load);
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState({code:"",name:"",category:"Materiais clínicos",supplier:"",currentQuantity:"0",minimumQuantity:"0",unit:"unidades",batch:"",expirationDate:"",location:"",unitCost:"0"});
  const persist=(next:InventoryItem[])=>{setItems(next);localStorage.setItem(KEY,JSON.stringify(next))};
  const critical=items.filter(i=>i.currentQuantity<=i.minimumQuantity);
  const value=useMemo(()=>items.reduce((a,i)=>a+i.currentQuantity*i.unitCost,0),[items]);

  const save=()=>{
    if(!form.name.trim()||!form.code.trim())return;
    const q=Number(form.currentQuantity)||0,min=Number(form.minimumQuantity)||0;
    const item:InventoryItem={id:Date.now(),code:form.code.trim(),name:form.name.trim(),category:form.category,supplier:form.supplier.trim(),currentQuantity:q,minimumQuantity:min,unit:form.unit,batch:form.batch,expirationDate:form.expirationDate||undefined,location:form.location,unitCost:Number(form.unitCost)||0,status:statusOf(q,min)};
    persist([item,...items]);setOpen(false);
  };
  const adjust=(id:number,delta:number)=>persist(items.map(i=>i.id===id?{...i,currentQuantity:Math.max(0,i.currentQuantity+delta),status:statusOf(Math.max(0,i.currentQuantity+delta),i.minimumQuantity)}:i));

  return <Box>
    <PageHeader title="Estoque" description="Alimente o estoque, acompanhe consumo, mínimos e reposição crítica." actionLabel="Novo item" actionIcon={<AddIcon/>} onAction={()=>setOpen(true)}/>
    {critical.length>0&&<Alert severity="error" sx={{mb:2}}><strong>{critical.length} item(ns) precisam de reposição.</strong> O alerta é automático conforme o estoque mínimo configurado.</Alert>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(2,1fr)",xl:"repeat(4,1fr)"},gap:2,mb:3}}>
      <Summary title="Itens cadastrados" value={String(items.length)} icon={<Inventory2Icon/>}/>
      <Summary title="Reposição necessária" value={String(critical.length)} icon={<WarningAmberIcon/>}/>
      <Summary title="Fornecedores" value={String(new Set(items.map(i=>i.supplier).filter(Boolean)).size)} icon={<LocalShippingIcon/>}/>
      <Summary title="Valor em estoque" value={brl(value)} icon={<MonetizationOnIcon/>}/>
    </Box>
    <Paper variant="outlined" sx={{overflow:"hidden"}}>
      {items.map(i=><Box key={i.id} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"2fr 1fr 1fr 170px"},gap:2,p:2,borderBottom:"1px solid",borderColor:"divider",alignItems:"center"}}>
        <Box><Typography sx={{fontWeight:800}}>{i.name}</Typography><Typography variant="caption" color="text.secondary">{i.code} • {i.category} • {i.supplier||"Sem fornecedor"}</Typography></Box>
        <Box><Typography sx={{fontWeight:800}}>{i.currentQuantity} {i.unit}</Typography><Typography variant="caption">mínimo {i.minimumQuantity}</Typography></Box>
        <Chip size="small" label={i.status} color={i.status==="Crítico"?"error":i.status==="Estoque baixo"?"warning":"success"}/>
        <Stack direction="row" spacing={1}><Button size="small" variant="outlined" onClick={()=>adjust(i.id,-1)}>-1 saída</Button><Button size="small" variant="contained" onClick={()=>adjust(i.id,1)}>+1 entrada</Button></Stack>
      </Box>)}
    </Paper>
    <Box sx={{display:"flex",justifyContent:"flex-end",mt:2}}>
      <Button variant="contained" startIcon={<LocalShippingIcon/>} onClick={()=>alert(critical.map(i=>`${i.name}: atual ${i.currentQuantity}, mínimo ${i.minimumQuantity}`).join("\n")||"Nenhum item em reposição.")}>Gerar solicitação de compras</Button>
    </Box>
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Novo item de estoque</DialogTitle><DialogContent sx={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1.5,pt:"12px!important"}}>
      <TextField label="Código/SKU" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><TextField label="Produto" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
      <TextField label="Categoria" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><TextField label="Fornecedor" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/>
      <TextField label="Quantidade atual" type="number" value={form.currentQuantity} onChange={e=>setForm({...form,currentQuantity:e.target.value})}/><TextField label="Estoque mínimo" type="number" value={form.minimumQuantity} onChange={e=>setForm({...form,minimumQuantity:e.target.value})}/>
      <TextField select label="Unidade" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}>{["unidades","caixas","pacotes","frascos","seringas","kits"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>
      <TextField label="Custo unitário" type="number" value={form.unitCost} onChange={e=>setForm({...form,unitCost:e.target.value})}/>
      <TextField label="Lote" value={form.batch} onChange={e=>setForm({...form,batch:e.target.value})}/><TextField label="Validade" type="date" InputLabelProps={{shrink:true}} value={form.expirationDate} onChange={e=>setForm({...form,expirationDate:e.target.value})}/>
      <TextField label="Localização" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} sx={{gridColumn:"1/-1"}}/>
    </DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="contained" onClick={save}>Salvar</Button></DialogActions></Dialog>
  </Box>
}
function Summary({title,value,icon}:{title:string;value:string;icon:ReactNode}){return <Paper variant="outlined" sx={{p:2.5}}><Box sx={{color:"primary.main",mb:1}}>{icon}</Box><Typography variant="body2" color="text.secondary">{title}</Typography><Typography variant="h5" sx={{fontWeight:850}}>{value}</Typography></Paper>}

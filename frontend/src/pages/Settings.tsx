import { useNavigate } from "react-router-dom";
import { Box, Button, Divider, Paper, Typography } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import PaletteIcon from "@mui/icons-material/Palette";
import BusinessIcon from "@mui/icons-material/Business";
import PageHeader from "../components/PageHeader";
import PendingAlertsSettingsCard from "../components/PendingAlertsSettingsCard";
import TwoFactorCard from "../components/TwoFactorCard";
import FollowUpSettingsCard from "../components/FollowUpSettingsCard";
import SessionsCard from "../components/SessionsCard";
import SubscriptionCard from "../components/SubscriptionCard";
import FinderListingCard from "../components/FinderListingCard";
import DueRemindersSettingsCard from "../components/DueRemindersSettingsCard";
import FinancialHoldSettingsCard from "../components/FinancialHoldSettingsCard";
import DunningSettingsCard from "../components/DunningSettingsCard";
import { useAppTheme } from "../contexts/AppThemeContext";
const colors=[["Azul CompletoDonto","#1565C0"],["Azul Safira","#0B5FFF"],["Ciano Digital","#0891B2"],["Turquesa","#0F766E"],["Verde Clínica","#2E7D32"],["Esmeralda","#059669"],["Roxo Premium","#7B1FA2"],["Violeta","#6D28D9"],["Índigo","#4338CA"],["Magenta","#C026D3"],["Rosa","#DB2777"],["Vermelho","#C62828"],["Coral","#EA580C"],["Laranja Comercial","#EF6C00"],["Âmbar","#D97706"],["Dourado","#9A6700"],["Grafite","#334155"],["Preto Premium","#111827"]];
export default function Settings(){
 const {mode,primaryColor,toggleMode,setPrimaryColor}=useAppTheme();
 const navigate=useNavigate();
 return <Box><PageHeader title="Configurações" description="Identidade da clínica, aparência, cores e preferências do sistema."/>
 <SubscriptionCard/>
 <DueRemindersSettingsCard/>
 <FinderListingCard/>
 <TwoFactorCard/>
 <SessionsCard/>
 <FollowUpSettingsCard/>
 <PendingAlertsSettingsCard/>
 <FinancialHoldSettingsCard/>
 <DunningSettingsCard/>
 <Paper elevation={0} sx={{p:3,borderRadius:4,border:"1px solid",borderColor:"divider",mb:3}}><Box sx={{display:"flex",alignItems:"center",gap:2,flexWrap:"wrap"}}><BusinessIcon color="primary"/><Box sx={{flex:1,minWidth:220}}><Typography variant="h6" sx={{fontWeight:800}}>Identidade da clínica</Typography><Typography variant="body2" color="text.secondary">Nome, logo, cor, contatos e responsável técnico. Vale para o cabeçalho, documentos, cartões digitais e lembretes.</Typography></Box><Button variant="contained" onClick={()=>navigate("/kit-clinica?aba=identidade")}>Editar identidade</Button></Box></Paper>
 <Paper elevation={0} sx={{p:3,borderRadius:4,border:"1px solid",borderColor:"divider"}}><Box sx={{display:"flex",alignItems:"center",gap:2,mb:3}}><PaletteIcon color="primary"/><Box><Typography variant="h6" sx={{fontWeight:800}}>Paleta principal</Typography><Typography variant="body2" color="text.secondary">Escolha uma cor pronta ou use qualquer cor personalizada.</Typography></Box></Box><Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(2,1fr)",md:"repeat(6,1fr)"},gap:1.2}}>{colors.map(([name,value])=><Button key={value} onClick={()=>setPrimaryColor(value)} variant={primaryColor.toLowerCase()===value.toLowerCase()?"contained":"outlined"} sx={{minHeight:64,justifyContent:"flex-start",gap:1,textTransform:"none"}}><Box sx={{width:24,height:24,borderRadius:"50%",bgcolor:value,border:"2px solid #fff",boxShadow:"0 0 0 1px rgba(0,0,0,.2)"}}/><Typography variant="caption" sx={{fontWeight:700}}>{name}</Typography></Button>)}</Box><Divider sx={{my:3}}/><Box sx={{display:"flex",gap:2,alignItems:"center",flexWrap:"wrap"}}><Typography sx={{fontWeight:800}}>Cor personalizada</Typography><input aria-label="Cor personalizada" type="color" value={primaryColor} onChange={e=>setPrimaryColor(e.target.value)} style={{width:54,height:38,border:0,background:"transparent",cursor:"pointer"}}/><Typography variant="body2" color="text.secondary">{primaryColor}</Typography></Box></Paper>
 <Paper elevation={0} sx={{mt:3,p:3,borderRadius:4,border:"1px solid",borderColor:"divider"}}><Typography variant="h6" sx={{fontWeight:800,mb:1}}>Aparência</Typography><Typography variant="body2" color="text.secondary" sx={{mb:3}}>Alterne entre os modos claro e escuro.</Typography><Button variant="contained" onClick={toggleMode} startIcon={mode==="light"?<DarkModeIcon/>:<LightModeIcon/>}>{mode==="light"?"Ativar modo escuro":"Ativar modo claro"}</Button></Paper></Box>
}

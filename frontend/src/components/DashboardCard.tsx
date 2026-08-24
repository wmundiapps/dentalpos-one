import { Box, Card, CardActionArea, CardContent, Typography } from "@mui/material";
import type { ReactNode } from "react";
interface DashboardCardProps { titulo:string; valor:string; icone:ReactNode; descricao:string; onClick?:()=>void; }
export default function DashboardCard({titulo,valor,icone,descricao,onClick}:DashboardCardProps){
 const content=<CardContent sx={{height:"100%"}}><Box sx={{display:"flex",alignItems:"center",justifyContent:"space-between",mb:2}}><Typography color="text.secondary">{titulo}</Typography><Box sx={{width:44,height:44,borderRadius:2.5,display:"flex",alignItems:"center",justifyContent:"center",bgcolor:"primary.main",color:"#fff",boxShadow:"0 10px 24px rgba(21,101,192,.25)"}}>{icone}</Box></Box><Typography variant="h4" sx={{fontWeight:800}}>{valor}</Typography><Typography variant="body2" color="text.secondary" sx={{mt:1}}>{descricao}</Typography>{onClick&&<Typography variant="caption" color="primary" sx={{display:"block",mt:1.5,fontWeight:700}}>Abrir detalhes →</Typography>}</CardContent>;
 return <Card elevation={0} sx={{border:"1px solid",borderColor:"divider",borderRadius:4,height:"100%",overflow:"hidden",backgroundImage:"linear-gradient(145deg, rgba(255,255,255,.04), transparent)"}}>{onClick?<CardActionArea onClick={onClick} sx={{height:"100%"}}>{content}</CardActionArea>:content}</Card>
}

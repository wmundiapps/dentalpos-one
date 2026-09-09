import { Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";
export default function ClinicalSection({title,children}:{title:string;children:ReactNode}){return <Paper variant="outlined" sx={{p:2.5,borderRadius:3}}><Typography variant="h6" sx={{fontWeight:900,mb:2}}>{title}</Typography>{children}</Paper>}

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import EngineeringIcon from "@mui/icons-material/Engineering";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import InventoryIcon from "@mui/icons-material/Inventory";
import MenuBookIcon from "@mui/icons-material/MenuBook";

const rotinas = [
  {
    titulo: "Abertura da clínica",
    descricao: "Recepção, consultórios, equipamentos e áreas comuns.",
    progresso: 75,
  },
  {
    titulo: "Limpeza e organização",
    descricao: "Banheiros, copa, recepção, escritórios e consultórios.",
    progresso: 50,
  },
  {
    titulo: "Biossegurança",
    descricao: "Autoclave, resíduos, EPIs e controle de esterilização.",
    progresso: 80,
  },
  {
    titulo: "Fechamento da clínica",
    descricao: "Equipamentos, resíduos, alarmes e conferência final.",
    progresso: 20,
  },
];

const alertas = [
  {
    texto: "Realizar teste da autoclave",
    prioridade: "Alta",
    cor: "error" as const,
  },
  {
    texto: "Conferir temperatura da geladeira de toxina botulínica",
    prioridade: "Alta",
    cor: "error" as const,
  },
  {
    texto: "Medicamento de primeiros socorros próximo do vencimento",
    prioridade: "Média",
    cor: "warning" as const,
  },
  {
    texto: "Solicitar café, açúcar e papel-toalha",
    prioridade: "Baixa",
    cor: "info" as const,
  },
];

const documentos = [
  {
    codigo: "POP-001",
    titulo: "Preparação do café",
    categoria: "Copa",
  },
  {
    codigo: "IT-002",
    titulo: "Limpeza dos banheiros",
    categoria: "Limpeza",
  },
  {
    codigo: "POP-003",
    titulo: "Acondicionamento de resíduos hospitalares",
    categoria: "Biossegurança",
  },
  {
    codigo: "IT-004",
    titulo: "Teste diário da autoclave",
    categoria: "Esterilização",
  },
];

export default function Operations() {
  const [docOpen,setDocOpen]=useState(false);
  const [docs,setDocs]=useState(documentos);
  const [doc,setDoc]=useState({tipo:"POP",codigo:"",titulo:"",categoria:"",responsavel:"",versao:"1.0",revisao:"",conteudo:""});
  const saveDoc=()=>{if(!doc.codigo.trim()||!doc.titulo.trim())return;setDocs([{codigo:doc.codigo.trim(),titulo:doc.titulo.trim(),categoria:doc.categoria.trim()||"Geral"},...docs]);setDocOpen(false)};
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        Gestão Operacional
      </Typography>

      <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
        Limpeza, manutenção, biossegurança, POPs, ITs e materiais de consumo.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
        }}
      >
        <PainelResumo
          titulo="Rotinas de hoje"
          valor="12"
          icone={<AssignmentTurnedInIcon />}
        />

        <PainelResumo
          titulo="Limpezas pendentes"
          valor="4"
          icone={<CleaningServicesIcon />}
        />

        <PainelResumo
          titulo="Manutenções"
          valor="3"
          icone={<EngineeringIcon />}
        />

        <PainelResumo
          titulo="Itens para compra"
          valor="8"
          icone={<InventoryIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "1.4fr 1fr",
          },
          gap: 3,
          mt: 4,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
            Checklists operacionais
          </Typography>

          {rotinas.map((rotina) => (
            <Box key={rotina.titulo} sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 1,
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    {rotina.titulo}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    {rotina.descricao}
                  </Typography>
                </Box>

                <Typography sx={{ fontWeight: 700 }}>
                  {rotina.progresso}%
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={rotina.progresso}
                sx={{
                  height: 9,
                  borderRadius: 10,
                }}
              />
            </Box>
          ))}
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
            Alertas operacionais
          </Typography>

          {alertas.map((alerta) => (
            <Box
              key={alerta.texto}
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: "#F8FAFC",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography sx={{ fontWeight: 600, mb: 1 }}>
                {alerta.texto}
              </Typography>

              <Chip
                size="small"
                label={`Prioridade ${alerta.prioridade}`}
                color={alerta.cor}
              />
            </Box>
          ))}
        </Paper>
      </Box>

      <Dialog open={docOpen} onClose={()=>setDocOpen(false)} fullWidth maxWidth="md"><DialogTitle>Novo POP / IT</DialogTitle><DialogContent sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"1fr 1fr"},gap:2,pt:"12px!important"}}><TextField select label="Tipo" value={doc.tipo} onChange={e=>setDoc({...doc,tipo:e.target.value})}>{["POP","IT"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField required label="Código" placeholder="POP-005" value={doc.codigo} onChange={e=>setDoc({...doc,codigo:e.target.value})}/><TextField required label="Título" value={doc.titulo} onChange={e=>setDoc({...doc,titulo:e.target.value})}/><TextField label="Categoria / setor" value={doc.categoria} onChange={e=>setDoc({...doc,categoria:e.target.value})}/><TextField label="Responsável" value={doc.responsavel} onChange={e=>setDoc({...doc,responsavel:e.target.value})}/><TextField label="Versão" value={doc.versao} onChange={e=>setDoc({...doc,versao:e.target.value})}/><TextField type="date" label="Revisão" value={doc.revisao} onChange={e=>setDoc({...doc,revisao:e.target.value})} slotProps={{inputLabel:{shrink:true}}}/><TextField multiline rows={5} label="Conteúdo / instruções" value={doc.conteudo} onChange={e=>setDoc({...doc,conteudo:e.target.value})} sx={{gridColumn:{md:"1/-1"}}}/></DialogContent><DialogActions><Button onClick={()=>setDocOpen(false)}>Cancelar</Button><Button variant="contained" onClick={saveDoc}>Salvar documento</Button></DialogActions></Dialog>

      <Paper
        elevation={0}
        sx={{
          mt: 3,
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Biblioteca de POPs e ITs
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Procedimentos e instruções de trabalho da clínica.
            </Typography>
          </Box>

          <Button variant="contained" startIcon={<MenuBookIcon />} onClick={()=>setDocOpen(true)}>Novo documento</Button>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
              xl: "repeat(4, 1fr)",
            },
            gap: 2,
          }}
        >
          {docs.map((documento) => (
            <Paper
              key={documento.codigo}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
              }}
            >
              <Chip
                size="small"
                label={documento.codigo}
                color="primary"
                sx={{ mb: 2 }}
              />

              <Typography sx={{ fontWeight: 700 }}>
                {documento.titulo}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {documento.categoria}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          mt: 3,
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <HealthAndSafetyIcon color="primary" fontSize="large" />

        <Box>
          <Typography sx={{ fontWeight: 700 }}>
            Manual de Biossegurança
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Treinamentos, resíduos, esterilização, EPIs e prevenção de riscos.
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Button variant="outlined">Abrir manual</Button>
      </Paper>
    </Box>
  );
}

interface PainelResumoProps {
  titulo: string;
  valor: string;
  icone: React.ReactNode;
}

function PainelResumo({
  titulo,
  valor,
  icone,
}: PainelResumoProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          width: 46,
          height: 46,
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
        }}
      >
        {icone}
      </Box>

      <Typography color="text.secondary">{titulo}</Typography>

      <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
        {valor}
      </Typography>
    </Paper>
  );
}
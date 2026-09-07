import { useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";

export default function AffiliateSupplierForm5787(){
  const [accepted,setAccepted]=useState(false);
  return <Stack spacing={1.5}>
    <Typography variant="h6" sx={{fontWeight:800}}>Quero ser fornecedor afiliado</Typography>
    <TextField label="Razão social / Nome" name="legalName"/>
    <TextField label="CNPJ/CPF" name="document"/>
    <TextField label="Responsável" name="contactName"/>
    <TextField label="E-mail" name="email"/>
    <TextField label="WhatsApp" name="phone"/>
    <TextField label="Link da loja do fornecedor" name="storeUrl"/>
    <Alert severity="info">
      Ao aceitar a afiliação, as vendas atribuídas a clientes originados pelo DentalPos One gerarão comissão de
      <strong> 10% </strong> para o DentalPos One, de responsabilidade do fornecedor, salvo percentual diferente configurado em contrato.
    </Alert>
    <FormControlLabel control={<Checkbox checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>} label="Li e aceito as condições comerciais e a comissão configurada."/>
    <Button disabled={!accepted} variant="contained">Enviar cadastro para análise</Button>
  </Stack>
}

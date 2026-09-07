import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import FingerprintIcon from "@mui/icons-material/Fingerprint";

const MOBILE=/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i;

export default function RHPointDesktopCard5787(){
  const mobile=MOBILE.test(navigator.userAgent);
  const url=import.meta.env.VITE_REVAH_RH_POINT_URL || "http://localhost:8787/kiosk";
  return <Card sx={{border:2,borderColor:"primary.main"}}>
    <CardContent>
      <Stack direction="row" spacing={1} alignItems="center">
        <FingerprintIcon color="primary"/>
        <Typography variant="h6" sx={{fontWeight:900}}>REGISTRAR PONTO — REVAH RH</Typography>
      </Stack>
      <Typography color="text.secondary" sx={{my:1}}>Uso exclusivamente no local da empresa, em computador autorizado.</Typography>
      {mobile?<Alert severity="error">Registro de ponto bloqueado em celular.</Alert>:
        <Button variant="contained" size="large" onClick={()=>window.location.href=url}>Abrir biometria / ponto</Button>}
    </CardContent>
  </Card>
}

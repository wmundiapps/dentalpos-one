import { createTheme } from "@mui/material/styles";
import type { PaletteMode } from "@mui/material";
export function createAppTheme(mode:PaletteMode,primaryColor:string){
 return createTheme({
  palette:{mode,primary:{main:primaryColor},secondary:{main:"#00ACC1"},background:{default:mode==="light"?"#F3F6FB":"#08111F",paper:mode==="light"?"#FFFFFF":"#111C2D"}},
  shape:{borderRadius:14},
  typography:{fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',h4:{fontWeight:800},h5:{fontWeight:800},h6:{fontWeight:800}},
  components:{
   MuiButton:{styleOverrides:{root:{textTransform:"none",fontWeight:800,borderRadius:10}}},
   MuiPaper:{styleOverrides:{root:{backgroundImage:"none"}}},
   MuiCard:{styleOverrides:{root:{boxShadow:mode==="light"?"0 12px 35px rgba(15,23,42,.06)":"0 14px 36px rgba(0,0,0,.22)"}}},
   MuiTextField:{defaultProps:{variant:"outlined"}},
  }
 });
}

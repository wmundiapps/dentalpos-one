import { CssBaseline, ThemeProvider } from "@mui/material";
import type { PaletteMode } from "@mui/material";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createAppTheme } from "../theme/theme";
interface AppThemeContextValue { mode:PaletteMode; primaryColor:string; toggleMode:()=>void; setPrimaryColor:(color:string)=>void; }
interface AppThemeProviderProps { children:ReactNode; }
const AppThemeContext=createContext<AppThemeContextValue|null>(null);
const MODE_KEY="dentalpos.theme.mode"; const COLOR_KEY="dentalpos.theme.primary";
export function AppThemeProvider({children}:AppThemeProviderProps){
 const [mode,setMode]=useState<PaletteMode>(()=>(localStorage.getItem(MODE_KEY)==="dark"?"dark":"light"));
 const [primaryColor,setPrimaryColorState]=useState(()=>localStorage.getItem(COLOR_KEY)||"#1565C0");
 useEffect(()=>localStorage.setItem(MODE_KEY,mode),[mode]); useEffect(()=>localStorage.setItem(COLOR_KEY,primaryColor),[primaryColor]);
 const toggleMode=()=>setMode(m=>m==="light"?"dark":"light"); const setPrimaryColor=(color:string)=>setPrimaryColorState(color);
 const theme=useMemo(()=>createAppTheme(mode,primaryColor),[mode,primaryColor]); const contextValue=useMemo(()=>({mode,primaryColor,toggleMode,setPrimaryColor}),[mode,primaryColor]);
 return <AppThemeContext.Provider value={contextValue}><ThemeProvider theme={theme}><CssBaseline/>{children}</ThemeProvider></AppThemeContext.Provider>
}
export function useAppTheme(){const context=useContext(AppThemeContext);if(!context)throw new Error("useAppTheme deve ser utilizado dentro de AppThemeProvider.");return context}

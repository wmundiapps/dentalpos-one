import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import AccessibilityTools from "./components/AccessibilityTools";
import { AppThemeProvider } from "./contexts/AppThemeContext";
import { repairLocalStorageText } from "./utils/textEncoding";
import { reloadOnceForNewVersion } from "./components/AppErrorBoundary";

import "./index.css";
import "./print.css";

repairLocalStorageText();

// Arquivo de uma tela nova que não existe mais na versão carregada: busca a versão atual do sistema.
window.addEventListener("vite:preloadError", (event) => { event.preventDefault(); reloadOnceForNewVersion(); });

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento root nÃ£o encontrado.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppThemeProvider>
        <App />
        <AccessibilityTools />
      </AppThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
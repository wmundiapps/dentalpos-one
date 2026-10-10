import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppThemeProvider } from "./contexts/AppThemeContext";
import { installActionFeedback } from "./services/ActionFeedback";
import { repairLocalStorageText } from "./utils/textEncoding";

import "./index.css";
import "./print.css";

repairLocalStorageText();
installActionFeedback();

// Trava de domínio (opcional): defina VITE_ALLOWED_HOSTS="app.exemplo.com,*.exemplo.com" para só rodar nesses hosts.
function hostAllowed(): boolean {
  const list = String(import.meta.env.VITE_ALLOWED_HOSTS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const h = window.location.hostname.toLowerCase();
  return list.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) : h === p)) || h === "localhost" || h === "127.0.0.1";
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento root nÃ£o encontrado.");
}

if (!hostAllowed()) {
  rootElement.innerHTML = '<div style="font-family:system-ui;padding:48px;text-align:center"><h2>Uso não autorizado</h2><p>Este software não está licenciado para este endereço.</p></div>';
} else createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
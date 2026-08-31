import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppThemeProvider } from "./contexts/AppThemeContext";
import { repairLocalStorageText } from "./utils/textEncoding";

import "./index.css";

repairLocalStorageText();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento root nÃ£o encontrado.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
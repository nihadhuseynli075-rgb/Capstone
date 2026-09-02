import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { LanguageProvider } from "./lib/i18n";
import "./styles/global.css";
import "./styles/components.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
// The shared stylesheets load before App, so the page styles App brings in
// (landing.css) come after them and win the ties they are meant to win.
import "./styles/global.css";
import "./styles/components.css";
import "./styles/education-ui.css";
import { App } from "./app/App";
import { LanguageProvider } from "./lib/i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);

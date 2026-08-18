import { useEffect, useState } from "react";
import { Wordmark } from "../lib/brand";
import { applyTheme, getStoredTheme, type Theme } from "../lib/theme";
import { AdminPage } from "../pages/AdminPage";
import { ExamPage } from "../pages/ExamPage";
import { HistoryPage } from "../pages/HistoryPage";
import { HomePage } from "../pages/HomePage";
import { ResultsPage } from "../pages/ResultsPage";
import { TestBuilderPage } from "../pages/TestBuilderPage";
import { navigate, useRoute } from "./router";

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <button
      type="button"
      className="ghost-button"
      onClick={() => onChange(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}

export function App() {
  const path = useRoute();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // The exam header is deliberately bare: no navigation links to click away
  // with mid-test.
  const isExam = path === "/exam";

  function renderPage() {
    if (path === "/build") return <TestBuilderPage />;
    if (path === "/exam") return <ExamPage />;
    if (path === "/history") return <HistoryPage />;
    if (path.startsWith("/results")) {
      const attemptId = path.split("/")[2];
      return <ResultsPage attemptId={attemptId} />;
    }
    if (path === "/admin") return <AdminPage />;
    return <HomePage />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="#/"
          className="brand-link"
          onClick={(event) => {
            if (isExam && !window.confirm("Leave this test? Your answers will be lost.")) {
              event.preventDefault();
            }
          }}
        >
          <Wordmark />
        </a>

        {!isExam && (
          <nav className="app-nav">
            <button type="button" className="ghost-button" onClick={() => navigate("/build")}>
              New test
            </button>
            <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
              History
            </button>
            <ThemeToggle theme={theme} onChange={setTheme} />
          </nav>
        )}
      </header>

      <main className="app-main">{renderPage()}</main>

      {!isExam && (
        <footer className="app-footer">
          <span>ExamPeak - Grade 9 mock test practice</span>
          <a href="#/admin">Admin dashboard</a>
        </footer>
      )}
    </div>
  );
}

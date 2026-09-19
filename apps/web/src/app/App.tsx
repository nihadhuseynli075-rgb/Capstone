import { useEffect, useRef, useState } from "react";
import { Wordmark } from "../lib/brand";
import { applyTheme, useTheme, type Theme } from "../lib/theme";
import { useLanguage } from "../lib/i18n";
import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { useHistoryClaim } from "../features/auth/useHistoryClaim";
import { AdminPage } from "../pages/AdminPage";
import { FriendsPage } from "../pages/FriendsPage";
import { ExamPage } from "../pages/ExamPage";
import { HistoryPage } from "../pages/HistoryPage";
import { MainPage } from "../pages/MainPage";
import { ResultsPage } from "../pages/ResultsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TestBuilderPage } from "../pages/TestBuilderPage";
import { navigate, useRoute } from "./router";

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const { t } = useLanguage();
  const next = theme === "light" ? "dark" : "light";
  const label = theme === "light" ? t("nav.darkMode") : t("nav.lightMode");

  return (
    <button
      type="button"
      className="ghost-button"
      onClick={() => onChange(next)}
      aria-label={label}
      title={label}
    >
      {label}
    </button>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The signed-in menu in the header: name, settings, sign out. */
function AccountMenu() {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, the two ways anyone expects to dismiss
  // a menu they opened by accident.
  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!user) {
    return (
      <button type="button" className="ghost-button" onClick={() => navigate("/login")}>
        {t("nav.signIn")}
      </button>
    );
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="avatar" aria-hidden="true">
          {initialsOf(user.fullName)}
        </span>
        <span className="account-name">{user.fullName}</span>
      </button>

      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-dropdown-head">
            <strong>{user.fullName}</strong>
            <span>{user.email}</span>
          </div>

          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
          >
            {t("nav.settings")}
          </button>

          <button
            type="button"
            className="account-item danger"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate("/");
            }}
          >
            {t("nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const path = useRoute();
  const { t } = useLanguage();
  const { ready } = useAuth();
  const [theme, setTheme] = useTheme();

  // The navigation is a row of buttons on anything wider than a phone. Below
  // that it collapses behind one button: three buttons and an account chip
  // wrapped onto a second row and took a fifth of a phone screen before the
  // page had said anything.
  const [navOpen, setNavOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Pulls any guest history onto the account the first time someone signs in.
  useHistoryClaim();

  // Paints the stored theme on first load. Later changes are applied by the
  // theme store itself, wherever they were made from.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Going somewhere is the point of the menu, so arriving closes it.
  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  // The two ways anyone expects to dismiss a menu: Escape, or a tap outside it.
  useEffect(() => {
    if (!navOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    function handlePointer(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setNavOpen(false);
      }
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handlePointer);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handlePointer);
    };
  }, [navOpen]);

  // The auth screens bring their own full-page layout, so they render outside
  // the shell rather than inside the content column.
  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;

  // The exam header is deliberately bare: no navigation links to click away
  // with mid-test.
  const isExam = path === "/exam";

  function renderPage() {
    if (path === "/build") return <TestBuilderPage />;
    if (path === "/exam") return <ExamPage />;
    if (path === "/history") return <HistoryPage />;
    if (path === "/friends") return <FriendsPage />;
    if (path === "/settings") return <SettingsPage />;
    if (path.startsWith("/results")) {
      const attemptId = path.split("/")[2];
      return <ResultsPage attemptId={attemptId} />;
    }
    if (path === "/admin") return <AdminPage />;
    return <MainPage />;
  }

  return (
    <div className="app-shell">
      <header className="app-header" ref={headerRef}>
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
          <>
            {/* Shown only on a phone, where the nav below is a drop-down. */}
            <button
              type="button"
              className="ghost-button nav-toggle"
              aria-expanded={navOpen}
              aria-controls="app-nav"
              onClick={() => setNavOpen((current) => !current)}
            >
              {t("nav.menu")}
            </button>

            <nav id="app-nav" className={`app-nav ${navOpen ? "open" : ""}`}>
              <button type="button" className="ghost-button" onClick={() => navigate("/build")}>
                {t("nav.newTest")}
              </button>
              <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
                {t("nav.history")}
              </button>
              <ThemeToggle theme={theme} onChange={setTheme} />
              {/* Held back until the stored session is known, so the header does
                  not flash "Sign in" at somebody who already is. */}
              {ready && <AccountMenu />}
            </nav>
          </>
        )}
      </header>

      <main className="app-main">{renderPage()}</main>

      {!isExam && (
        <footer className="app-footer">
          <span>Exampeak - Grade 9 mock test practice</span>
          <a href="#/admin">{t("nav.admin")}</a>
        </footer>
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

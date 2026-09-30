import { useEffect, useRef, useState } from "react";

import { Wordmark } from "../lib/brand";
import { applyTheme, useTheme } from "../lib/theme";
import { useLanguage, type TranslationKey } from "../lib/i18n";

import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { useHistoryClaim } from "../features/auth/useHistoryClaim";

import { Avatar } from "../features/profile/Avatar";
import { ProfileProvider, useProfile } from "../features/profile/ProfileContext";

import { AdminPage } from "../pages/AdminPage";
import { FriendsPage } from "../pages/FriendsPage";
import { ExamPage } from "../pages/ExamPage";
import { HistoryPage } from "../pages/HistoryPage";
import { LandingPage } from "../pages/LandingPage";
import { MainPage } from "../pages/MainPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ResultsPage } from "../pages/ResultsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TestBuilderPage } from "../pages/TestBuilderPage";

import { navigate, useRoute } from "./router";


/**
 * Three lines that fold into a cross while the menu is open. The stroke
 * follows the text colour, so it suits both themes.
 */
function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}


function AccountMenu() {
  const { t } = useLanguage();

  const {
    user,
    signOut
  } = useAuth();

  /*
   * The profile's name and photo, once loaded.
   * Until then, the name on the account.
   */
  const { profile } = useProfile();

  const [open, setOpen] =
    useState(false);

  const menuRef =
    useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(
          event.target as Node
        )
      ) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointer
    );

    document.addEventListener(
      "keydown",
      handleKey
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointer
      );

      document.removeEventListener(
        "keydown",
        handleKey
      );
    };
  }, [open]);


  if (!user) {
    return (
      <button
        type="button"
        className="ghost-button"
        onClick={() => navigate("/login")}
      >
        {t("nav.signIn")}
      </button>
    );
  }


  const name =
    profile?.fullName ?? user.fullName;


  return (
    <div
      className="account-menu"
      ref={menuRef}
    >
      <button
        type="button"
        className="account-trigger"
        onClick={() =>
          setOpen(
            (current) => !current
          )
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar
          name={name}
          photoUrl={profile?.avatarUrl}
        />

        <span className="account-name">
          {name}
        </span>
      </button>


      {open && (
        <div
          className="account-dropdown"
          role="menu"
        >
          <div className="account-dropdown-head">
            <strong>
              {name}
            </strong>

            <span>
              {user.email}
            </span>
          </div>

          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/profile");
            }}
          >
            {t("nav.profile")}
          </button>

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


/*
 * Страницы приложения.
 * Всё остальное — главная.
 */
function isAppPage(path: string): boolean {
  return (
    [
      "/build",
      "/exam",
      "/history",
      "/friends",
      "/profile",
      "/settings",
      "/admin"
    ].includes(path) ||
    path.startsWith("/results")
  );
}


function Shell() {
  const path = useRoute();

  const { t } = useLanguage();

  const {
    ready,
    user
  } = useAuth();

  const [theme] = useTheme();

  const [
    navOpen,
    setNavOpen
  ] = useState(false);

  const headerRef =
    useRef<HTMLElement>(null);


  useHistoryClaim();


  useEffect(() => {
    applyTheme(theme);
  }, [theme]);


  useEffect(() => {
    setNavOpen(false);
  }, [path]);


  useEffect(() => {
    if (!navOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    }

    function handlePointer(event: MouseEvent) {
      if (
        headerRef.current &&
        !headerRef.current.contains(
          event.target as Node
        )
      ) {
        setNavOpen(false);
      }
    }

    document.addEventListener(
      "keydown",
      handleKey
    );

    document.addEventListener(
      "mousedown",
      handlePointer
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKey
      );

      document.removeEventListener(
        "mousedown",
        handlePointer
      );
    };
  }, [navOpen]);


  if (!ready) {
    return (
      <div className="landing-loading">
        Loading Exampeak...
      </div>
    );
  }


  if (path === "/login") {
    return <LoginPage />;
  }


  if (path === "/register") {
    return <RegisterPage />;
  }


  if (!user && !isAppPage(path)) {
    return <LandingPage />;
  }


  const isExam =
    path === "/exam";

  const navItems: Array<{ path: string; label: TranslationKey; active: boolean }> = [
    { path: "/", label: user ? "nav.dashboard" : "nav.home", active: path === "/" },
    { path: "/build", label: "nav.newTest", active: path === "/build" },
    { path: "/history", label: "nav.history", active: path === "/history" || path.startsWith("/results") }
  ];


  function renderPage() {
    if (path === "/build") {
      return <TestBuilderPage />;
    }

    if (path === "/exam") {
      return <ExamPage />;
    }

    if (path === "/history") {
      return <HistoryPage />;
    }

    if (path === "/friends") {
      return <FriendsPage />;
    }

    if (path === "/profile") {
      return <ProfilePage />;
    }

    if (path === "/settings") {
      return <SettingsPage />;
    }

    if (path.startsWith("/results")) {
      const attemptId =
        path.split("/")[2];

      return (
        <ResultsPage
          attemptId={attemptId}
        />
      );
    }

    if (path === "/admin") {
      return <AdminPage />;
    }

    return <MainPage />;
  }


  return (
    <div className="app-shell">
      <header
        className="app-header"
        ref={headerRef}
      >
        <a
          href="#/"
          className="brand-link"
          onClick={(event) => {
            if (
              isExam &&
              !window.confirm(
                "Leave this test? Your answers will be lost."
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <Wordmark />
        </a>


        {!isExam && (
          <>
            <button
              type="button"
              className="ghost-button icon-button nav-toggle"
              aria-expanded={navOpen}
              aria-controls="app-nav"
              aria-label={t("nav.menu")}
              title={t("nav.menu")}
              onClick={() =>
                setNavOpen(
                  (current) => !current
                )
              }
            >
              <HamburgerIcon open={navOpen} />
            </button>


            <nav
              id="app-nav"
              className={
                `app-nav ${
                  navOpen
                    ? "open"
                    : ""
                }`
              }
            >
              {/*
               * The wordmark goes home too, but nobody reads a logo as a
               * button: from Settings or Profile there was no visible way back.
               * Signed in, home is the dashboard; signed out, the landing page.
               */}
              {navItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="ghost-button"
                  aria-current={item.active ? "page" : undefined}
                  onClick={() =>
                    navigate(item.path)
                  }
                >
                  {t(item.label)}
                </button>
              ))}

              {/* Light and dark mode live in Settings, under the account menu. */}
              <AccountMenu />
            </nav>
          </>
        )}
      </header>


      <main className="app-main">
        {renderPage()}
      </main>


      {!isExam && (
        <footer className="app-footer">
          <span>
            {t("footer.tagline")}
          </span>

          <a href="#/admin" className="footer-admin-link">
            {t("nav.admin")}
          </a>
        </footer>
      )}
    </div>
  );
}


export function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <Shell />
      </ProfileProvider>
    </AuthProvider>
  );
}
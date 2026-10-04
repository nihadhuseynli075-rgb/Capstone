import { useEffect, useRef, useState } from "react";

import { IconMoon, IconSun } from "../components/icons";
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


/**
 * Light and dark mode in one tap, from the header bar rather than from inside
 * the collapsible menu or the Settings page (which keeps its own control).
 *
 * The icon is the theme the page is in now, a sun while it is light and a moon
 * while it is dark. The label says what a tap does, so it names the other
 * theme. If the icon should show where a tap leads instead, swap the two icons
 * below; the label is already right for that.
 */
function ThemeToggle() {
  const { t } = useLanguage();

  const [theme, setTheme] = useTheme();

  const next =
    theme === "light"
      ? "dark"
      : "light";

  const label =
    next === "dark"
      ? t("nav.themeToDark")
      : t("nav.themeToLight");

  return (
    <button
      type="button"
      className="ghost-button icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      {theme === "light" ? <IconSun /> : <IconMoon />}
    </button>
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

  const triggerRef =
    useRef<HTMLButtonElement>(null);


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

    /*
     * Escape closes the list and puts focus back on the button that opened
     * it; left where it was, focus fell to the page itself and a keyboard
     * user had to start again from the top. Listened for while capturing, so
     * it is heard before the phone menu's own Escape, and marked as handled
     * so that menu stays open: one press closes one thing.
     */
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointer
    );

    document.addEventListener(
      "keydown",
      handleKey,
      true
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointer
      );

      document.removeEventListener(
        "keydown",
        handleKey,
        true
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


  /*
   * A disclosure rather than an ARIA menu: a button that shows a short list of
   * ordinary buttons, reached with Tab like everything else on the page. A
   * role="menu" promises arrow-key movement, and this list never had it.
   *
   * Tabbing out of the list closes it. Left open, it sat over the page while
   * focus moved on underneath it. Only a move to somewhere else counts: a
   * click on the name or email in the list moves focus to nowhere, and the
   * list should stay.
   */
  return (
    <div
      className="account-menu"
      ref={menuRef}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="account-trigger"
        ref={triggerRef}
        onClick={() =>
          setOpen(
            (current) => !current
          )
        }
        aria-expanded={open}
        aria-controls="account-dropdown"
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
          id="account-dropdown"
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
            onClick={() => {
              setOpen(false);
              navigate("/profile");
            }}
          >
            {t("nav.profile")}
          </button>

          {/* Here rather than in the bar: the bar is already full at tablet width. */}
          <button
            type="button"
            className="account-item"
            onClick={() => {
              setOpen(false);
              navigate("/friends");
            }}
          >
            {t("main.friends")}
          </button>

          <button
            type="button"
            className="account-item"
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

  const navToggleRef =
    useRef<HTMLButtonElement>(null);


  useHistoryClaim();


  useEffect(() => {
    applyTheme(theme);
  }, [theme]);


  useEffect(() => {
    setNavOpen(false);
  }, [path]);


  useEffect(() => {
    if (!navOpen) return;

    /*
     * Escape folds the menu and gives focus back to the button that opened
     * it, as long as focus was in the header to begin with; otherwise it would
     * drop to the page and a keyboard user would start again from the top.
     * An Escape the account list has already used (see AccountMenu) is left
     * alone, so the menu around it stays open.
     */
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      const focused = document.activeElement;
      const focusWasHere =
        focused === document.body ||
        (headerRef.current?.contains(focused) ?? false);

      setNavOpen(false);
      if (focusWasHere) navToggleRef.current?.focus();
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


        {/*
          * The markup runs in the order the bar is read, so Tab moves left to
          * right: the menu button (phones only) comes just before the menu it
          * opens, and the theme button comes last, where it is drawn. It used
          * to sit before the links in the markup and be moved to the end by
          * the stylesheet, so focus jumped to the far right and back. The theme
          * button stays during an exam too: it changes nothing about the paper.
          */}
        {!isExam && (
          <button
            type="button"
            className="ghost-button icon-button nav-toggle"
            ref={navToggleRef}
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
        )}


        {!isExam && (
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

            <AccountMenu />
          </nav>
        )}


        <ThemeToggle />
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
import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { LanguageSelect, ThemeToggle } from "../components/SiteControls";
import { Wordmark } from "../lib/brand";
import { applyTheme, useTheme } from "../lib/theme";
import { LanguageScope, useLanguage, usePinnedLanguage, type TranslationKey } from "../lib/i18n";

import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { currentRoute, signInRoute } from "../features/auth/returnPath";
import { useHistoryClaim } from "../features/auth/useHistoryClaim";

import { Avatar } from "../features/profile/Avatar";
import { ProfileProvider, useProfile } from "../features/profile/ProfileContext";

import { FriendsPage } from "../pages/FriendsPage";
import { ExamPage } from "../pages/ExamPage";
import { HistoryPage } from "../pages/HistoryPage";
import { LandingPage } from "../pages/LandingPage";
import { LegalPage } from "../pages/LegalPage";
import { MainPage } from "../pages/MainPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ResultsPage } from "../pages/ResultsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TestBuilderPage } from "../pages/TestBuilderPage";

import { navigate, navigateAway, replaceRoute, useRoute } from "./router";
import { useRouteFocus } from "./useRouteFocus";

/*
 * The admin dashboard, with its question form, is the largest page and no
 * student ever opens it, so it is its own file, fetched the first time
 * #/admin is visited rather than with every page of the app.
 */
const AdminPage = lazy(() => import("../pages/AdminPage").then((module) => ({ default: module.AdminPage })));


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
        onClick={() => navigate(signInRoute("login", currentRoute()))}
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
 * Every address the app has a page for. Anything else gets "Page not found"
 * rather than the landing page or the dashboard, which used to hide a
 * mistyped link behind a page that looked like it had worked.
 */
function isKnownRoute(path: string): boolean {
  return (
    [
      "/",
      "/login",
      "/register",
      "/build",
      "/exam",
      "/history",
      "/friends",
      "/profile",
      "/settings",
      "/admin",
      "/results",
      // Open to everyone, signed in or not: the sign-up form links here.
      "/privacy",
      "/terms",
      "/reset-password"
    ].includes(path) ||
    /^\/results\/[^/]+$/.test(path)
  );
}


/** The page's name for the tab title, from its route. */
function titleKeyFor(path: string, signedIn: boolean): TranslationKey {
  if (!isKnownRoute(path)) return "title.notFound";
  if (path === "/") return signedIn ? "title.dashboard" : "title.home";
  if (path.startsWith("/results")) return "title.results";

  const titles: Record<string, TranslationKey> = {
    "/login": "title.signIn",
    "/register": "title.register",
    "/build": "title.build",
    "/exam": "title.exam",
    "/history": "title.history",
    "/friends": "title.friends",
    "/profile": "title.profile",
    "/settings": "title.settings",
    "/admin": "title.admin",
    "/privacy": "title.privacy",
    "/terms": "title.terms",
    "/reset-password": "title.resetPassword"
  };

  return titles[path] ?? "title.home";
}


function Shell() {
  const path = useRoute();

  /*
   * The admin dashboard is in English whatever the site language (see
   * adminText), and so is everything drawn around it: the header, the
   * account menu, the footer and the tab title. They used to follow the site
   * language, so a Russian site put "Главная" and "Конфиденциальность" around
   * English headings. The language picker is left out there, since choosing
   * a language would change nothing on that page.
   */
  const adminPage = path === "/admin";
  const pageLanguage = usePinnedLanguage(adminPage ? "en" : null);
  const { t } = pageLanguage;

  const {
    ready,
    user,
    passwordRecovery
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

  // Every page, including the sign-in pages drawn outside the shell, hands
  // focus to its heading when it is reached by a route change.
  useRouteFocus(path);


  // A password reset link has just signed this tab in. It should land on the
  // reset page already, but a project that does not allow that address sends
  // it to the home page instead, so it is sent on from wherever it landed.
  // Only when it turns true: a student who then leaves the page is let go.
  useEffect(() => {
    if (passwordRecovery && window.location.hash.split("?")[0] !== "#/reset-password") {
      replaceRoute("/reset-password");
    }
  }, [passwordRecovery]);


  useEffect(() => {
    applyTheme(theme);
  }, [theme]);


  /*
   * Each page names itself in the tab, the browser history and a screen
   * reader's announcement of the page. With one title for the whole site,
   * every tab and every step back read "Exampeak - Grade 9 mock tests".
   */
  useEffect(() => {
    document.title = `${t(titleKeyFor(path, user !== null))} - Exampeak`;
  }, [path, user, t]);


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
        {t("app.loading")}
      </div>
    );
  }


  if (path === "/login") {
    return <LoginPage />;
  }


  if (path === "/register") {
    return <RegisterPage />;
  }


  if (path === "/reset-password") {
    return <ResetPasswordPage />;
  }


  // Home is the landing page for a visitor and the dashboard for a student.
  // Every other page, and "Page not found", is the same for both.
  if (!user && path === "/") {
    return <LandingPage />;
  }


  const isExam =
    path === "/exam";

  const navItems: Array<{ path: string; label: TranslationKey; active: boolean }> = [
    { path: "/", label: user ? "nav.dashboard" : "nav.home", active: path === "/" },
    { path: "/build", label: "nav.newTest", active: path === "/build" },
    {
      path: "/history",
      label: "nav.history",
      active: isKnownRoute(path) && (path === "/history" || path.startsWith("/results"))
    }
  ];


  function renderPage() {
    if (!isKnownRoute(path)) {
      return <NotFoundPage />;
    }

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
      return (
        <Suspense fallback={<p className="panel-hint" role="status">Loading the admin dashboard...</p>}>
          <AdminPage />
        </Suspense>
      );
    }

    if (path === "/privacy" || path === "/terms") {
      return <LegalPage kind={path === "/privacy" ? "privacy" : "terms"} />;
    }

    return <MainPage />;
  }


  // The page says which language it is in, for screen readers and browser
  // translation, where the document still names the site's.
  const shell = (
    <div className="app-shell" lang={adminPage ? "en" : undefined}>
      <header
        className="app-header"
        ref={headerRef}
      >
        {/* Named outright: below 760px the written name is hidden and the
            mark beside it is decoration, which would leave the link unnamed. */}
        <a
          href="#/"
          className="brand-link"
          aria-label="Exampeak"
          onClick={(event) => {
            // During a test the exam page's guard asks first (see
            // setLeaveGuard), before the address changes, so "stay" leaves
            // the history untouched.
            if (isExam) {
              event.preventDefault();
              navigateAway("/");
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

          <div className="footer-links">
            {/* For everyone, signed in or not: the language is the one setting
                a guest needs before they can read anything else. */}
            {!adminPage && <LanguageSelect />}

            <a href="#/privacy">{t("legal.privacy")}</a>
            <a href="#/terms">{t("legal.terms")}</a>

            <a href="#/admin" className="footer-admin-link">
              {t("nav.admin")}
            </a>
          </div>
        </footer>
      )}
    </div>
  );

  return <LanguageScope value={pageLanguage}>{shell}</LanguageScope>;
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
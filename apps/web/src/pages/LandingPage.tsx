import { navigate } from "../app/router";
import { Ascent } from "../components/Ascent";
import { LanguageSelect, ThemeToggle } from "../components/SiteControls";
import { SubjectShortcuts } from "../components/SubjectShortcuts";
import { useAuth } from "../features/auth/AuthContext";
import { Wordmark } from "../lib/brand";
import { useLanguage } from "../lib/i18n";
import "../styles/landing.css";

export function LandingPage() {
  const { t } = useLanguage();
  const { configured } = useAuth();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <Wordmark size={34} />

        <div className="landing-actions">
          {/* The first screen a visitor sees, so the language and the theme
              are chosen here rather than behind a page they cannot read yet. */}
          <div className="landing-controls">
            <LanguageSelect />
            <ThemeToggle />
          </div>

          {/* Without Supabase both of these lead to a form that cannot be sent,
              so they are only offered when accounts are switched on. The practice
              test below works either way. */}
          {configured && (
            <nav className="landing-nav">
              <button
                type="button"
                className="landing-login"
                onClick={() => navigate("/login")}
              >
                {t("landing.logIn")}
              </button>

              <button
                type="button"
                className="landing-signup"
                onClick={() => navigate("/register")}
              >
                {t("landing.signUp")}
              </button>
            </nav>
          )}
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-left">
            <p className="landing-label">
              {t("landing.label")}
            </p>

            <h1>
              {t("landing.titleLead")}
              <span>{t("landing.titlePeak")}</span>
            </h1>

            <div className="landing-intro">
              <p>{t("landing.intro")}</p>

              <p>{t("landing.introMore")}</p>
            </div>

            <div className="landing-start">
              <button
                type="button"
                className="landing-cta"
                onClick={() => navigate("/build")}
              >
                {t("main.startPractice")}
              </button>

              <span className="landing-cta-note">
                {t("main.noAccountNeeded")}
              </span>
            </div>

            <SubjectShortcuts className="landing-subjects" />
          </div>

          {/* The name drawn out: a test is a climb, and the three stages of one
              are the camps on the way to the summit. No scores here: a visitor
              has not taken a test, and invented results would be a claim. */}
          <div className="landing-right">
            <Ascent
              variant="path"
              steps={[t("landing.stepBuild"), t("landing.stepSit"), t("landing.stepReview")]}
            />
          </div>
        </section>

        <section className="landing-features">
          <article className="landing-feature">
            <h2>{t("landing.mockTests")}</h2>

            <p>{t("landing.mockTestsBody")}</p>
          </article>

          <article className="landing-feature">
            <div className="feature-head">
              <h2>{t("landing.dailyQuizzes")}</h2>
              <span className="soon-badge">{t("main.soon")}</span>
            </div>

            <p>{t("landing.dailyQuizzesBody")}</p>
          </article>

          <article className="landing-feature">
            <h2>{t("landing.trackProgress")}</h2>

            <p>{t("landing.trackProgressBody")}</p>
          </article>
        </section>

        <section className="landing-bottom">
          <span>EXAMPEAK</span>

          <p>{t("landing.closing")}</p>

          {/* The landing page has no footer, so these stand in for the app's. */}
          <nav className="landing-legal">
            <a href="#/privacy">{t("legal.privacy")}</a>
            <a href="#/terms">{t("legal.terms")}</a>
          </nav>
        </section>
      </main>
    </div>
  );
}
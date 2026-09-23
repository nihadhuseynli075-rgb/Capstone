import { navigate } from "../app/router";
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

            <div className="landing-description-box">
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

          <div className="landing-right">
            <div className="landing-orbit orbit-one" />
            <div className="landing-orbit orbit-two" />
            <div className="landing-glow" />

            <div className="landing-circle">
              <div className="circle-line circle-line-one" />
              <div className="circle-line circle-line-two" />

              <div className="peak peak-left" />
              <div className="peak peak-right" />
              <div className="peak peak-main" />

              <div className="peak-cap" />
            </div>
          </div>
        </section>

        <section className="landing-features">
          <article className="landing-feature">
            <span className="feature-number">01</span>

            <h2>{t("landing.mockTests")}</h2>

            <p>{t("landing.mockTestsBody")}</p>
          </article>

          <article className="landing-feature">
            <span className="feature-number">02</span>

            <h2>{t("landing.dailyQuizzes")}</h2>

            <p>{t("landing.dailyQuizzesBody")}</p>
          </article>

          <article className="landing-feature">
            <span className="feature-number">03</span>

            <h2>{t("landing.trackProgress")}</h2>

            <p>{t("landing.trackProgressBody")}</p>
          </article>
        </section>

        <section className="landing-bottom">
          <span>EXAMPEAK</span>

          <p>{t("landing.closing")}</p>
        </section>
      </main>
    </div>
  );
}
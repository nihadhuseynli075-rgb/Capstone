import { navigate } from "../app/router";
import { SubjectShortcuts } from "../components/SubjectShortcuts";
import { Wordmark } from "../lib/brand";
import { useLanguage } from "../lib/i18n";
import "../styles/landing.css";

export function LandingPage() {
  const { t } = useLanguage();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <Wordmark size={34} />

        <nav className="landing-nav">
          <button
            type="button"
            className="landing-login"
            onClick={() => navigate("/login")}
          >
            Log In
          </button>

          <button
            type="button"
            className="landing-signup"
            onClick={() => navigate("/register")}
          >
            Sign Up
          </button>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-left">
            <p className="landing-label">
              GRADE 9 EXAM PREPARATION
            </p>

            <h1>
              REACH YOUR
              <span>PEAK.</span>
            </h1>

            <div className="landing-description-box">
              <p>
                ExamPeak helps Grade 9 students prepare for final exams
                through mock tests, daily quizzes and detailed results.
              </p>

              <p>
                Practice by subject and difficulty, identify weak topics
                and track your progress as you improve.
              </p>
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

            <h2>Mock Tests</h2>

            <p>
              Create practice tests based on subject, topic and
              difficulty using Grade 9 exam-style questions.
            </p>
          </article>

          <article className="landing-feature">
            <span className="feature-number">02</span>

            <h2>Daily Quizzes</h2>

            <p>
              Complete new daily challenges designed to become
              progressively more difficult.
            </p>
          </article>

          <article className="landing-feature">
            <span className="feature-number">03</span>

            <h2>Track Progress</h2>

            <p>
              Review your scores, test history and mistakes to
              understand where you can improve.
            </p>
          </article>
        </section>

        <section className="landing-bottom">
          <span>EXAMPEAK</span>

          <p>
            One place to practise, measure your progress and prepare
            with confidence for your Grade 9 final exams.
          </p>
        </section>
      </main>
    </div>
  );
}
import { Component, type ReactNode } from "react";
import { getStoredLanguage, type Language } from "../lib/i18n";

/**
 * What is shown when the app itself fails, instead of a blank page.
 *
 * An error thrown while the app is drawn takes everything under React's root
 * down with it. Storage refused as the app started did exactly that, and left
 * a student looking at an empty page with no idea why and no way on. Caught
 * here, at the root, the page says something went wrong and offers a reload.
 *
 * It sits outside the language provider, which may be what failed, so its few
 * words live here rather than in the dictionaries, and the site language is
 * read again for itself, in English when even that fails.
 */

const TEXT: Record<Language, { title: string; body: string; reload: string }> = {
  en: {
    title: "Something went wrong",
    body: "This page could not be shown. Reload it to try again.",
    reload: "Reload the page"
  },
  ru: {
    title: "Что-то пошло не так",
    body: "Эту страницу не удалось показать. Обновите её и попробуйте снова.",
    reload: "Обновить страницу"
  },
  az: {
    title: "Nəsə alınmadı",
    body: "Bu səhifəni göstərmək mümkün olmadı. Səhifəni yeniləyib yenidən cəhd edin.",
    reload: "Səhifəni yenilə"
  }
};

function pageLanguage(): Language {
  try {
    return getStoredLanguage();
  } catch {
    return "en";
  }
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  // React reports the error itself, in the console, so this only switches pages.
  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const language = pageLanguage();
    const text = TEXT[language];

    return (
      <main className="app-error" lang={language}>
        <div className="app-error-card">
          <h1>{text.title}</h1>
          <p>{text.body}</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            {text.reload}
          </button>
        </div>
      </main>
    );
  }
}

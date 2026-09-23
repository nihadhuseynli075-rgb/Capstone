import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Site language.
 *
 * Three languages because that is what the students actually use: English,
 * Russian and Azerbaijani. Translations are plain objects rather than a library
 * - the app has one screen's worth of chrome to translate, and a full i18n
 * runtime would be more machinery than the whole feature is worth.
 *
 * `en` is the source of truth: its keys define the shape, and the other two are
 * typed against it, so adding an English string without a translation is a
 * compile error rather than a blank label in production.
 */

const STORAGE_KEY = "examPeak.language";

export const languages = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "az", label: "Azərbaycanca" }
] as const;

export type Language = (typeof languages)[number]["id"];

const en = {
  "nav.newTest": "New test",
  "nav.history": "History",
  "nav.settings": "Settings",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.darkMode": "Dark mode",
  "nav.lightMode": "Light mode",
  "nav.admin": "Admin dashboard",
  "nav.menu": "Menu",

  "main.greeting": "Welcome back",
  "main.greetingGuest": "Welcome to Exampeak",
  "main.eyebrow": "Grade 9 final exam prep",
  "main.startPractice": "Start a practice test",
  "main.noAccountNeeded": "No account needed",
  "main.subjectsTitle": "Jump straight into a subject",
  "main.lede":
    "Build a mock test from past-paper questions, sit it start to finish, and get your score, your mistakes and the reason behind every one of them at the end.",
  "main.createTest": "Create a mock test",
  "main.createTestBody":
    "Pick a subject and topics, choose a difficulty or set your own length and timer.",
  "main.history": "Test history",
  "main.historyBody": "Every test you have taken, your best result so far, and what you got wrong.",
  "main.friends": "Friends",
  "main.friendsBody": "Add friends and compare progress. Coming after the core app is finished.",
  "main.settings": "Settings",
  "main.settingsBody": "Your name, your password, the site language, and light or dark mode.",
  "main.soon": "Coming soon",
  "main.guestBanner":
    "You are taking tests as a guest. Create an account to keep your history on any device.",
  "main.testsTaken": "Tests taken",
  "main.bestScore": "Best score",
  "main.noTests": "No tests yet",

  "subject.math": "Maths",
  "subject.english": "English",
  "subject.russian": "Russian",

  "landing.logIn": "Log In",
  "landing.signUp": "Sign Up",
  "landing.label": "GRADE 9 EXAM PREPARATION",
  "landing.titleLead": "REACH YOUR",
  "landing.titlePeak": "PEAK.",
  "landing.intro":
    "ExamPeak helps Grade 9 students prepare for final exams through mock tests, daily quizzes and detailed results.",
  "landing.introMore":
    "Practice by subject and difficulty, identify weak topics and track your progress as you improve.",
  "landing.mockTests": "Mock Tests",
  "landing.mockTestsBody":
    "Create practice tests based on subject, topic and difficulty using Grade 9 exam-style questions.",
  "landing.dailyQuizzes": "Daily Quizzes",
  "landing.dailyQuizzesBody":
    "Complete new daily challenges designed to become progressively more difficult.",
  "landing.trackProgress": "Track Progress",
  "landing.trackProgressBody":
    "Review your scores, test history and mistakes to understand where you can improve.",
  "landing.closing":
    "One place to practise, measure your progress and prepare with confidence for your Grade 9 final exams.",

  "settings.title": "Settings",
  "settings.subtitle": "Your account and how the site looks.",
  "settings.profile": "Profile",
  "settings.name": "Name",
  "settings.email": "Email",
  "settings.emailHint": "Your email address cannot be changed here yet.",
  "settings.saveName": "Save name",
  "settings.nameSaved": "Name updated.",
  "settings.password": "Password",
  "settings.newPassword": "New password",
  "settings.confirmPassword": "Confirm new password",
  "settings.savePassword": "Change password",
  "settings.passwordSaved": "Password updated.",
  "settings.passwordMismatch": "Those two passwords do not match.",
  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.language": "Language",
  "settings.languageHint": "Changes the site straight away.",
  "settings.signedOut": "Sign in to change your name or password.",
  "settings.signInCta": "Sign in",
  "settings.notConfigured":
    "Accounts are not switched on yet because Supabase is not connected.",

  "common.saving": "Saving...",
  "common.back": "Back"
} as const;

export type TranslationKey = keyof typeof en;

type Dictionary = Record<TranslationKey, string>;

const ru: Dictionary = {
  "nav.newTest": "Новый тест",
  "nav.history": "История",
  "nav.settings": "Настройки",
  "nav.signIn": "Войти",
  "nav.signOut": "Выйти",
  "nav.darkMode": "Тёмная тема",
  "nav.lightMode": "Светлая тема",
  "nav.admin": "Панель администратора",
  "nav.menu": "Меню",

  "main.greeting": "С возвращением",
  "main.greetingGuest": "Добро пожаловать в Exampeak",
  "main.eyebrow": "Подготовка к выпускным экзаменам 9 класса",
  "main.startPractice": "Начать пробный тест",
  "main.noAccountNeeded": "Аккаунт не нужен",
  "main.subjectsTitle": "Сразу к предмету",
  "main.lede":
    "Составьте пробный тест из заданий прошлых лет, пройдите его целиком и в конце получите свой балл, свои ошибки и объяснение каждой из них.",
  "main.createTest": "Создать пробный тест",
  "main.createTestBody":
    "Выберите предмет и темы, уровень сложности или задайте свою длину и таймер.",
  "main.history": "История тестов",
  "main.historyBody": "Все пройденные тесты, ваш лучший результат и допущенные ошибки.",
  "main.friends": "Друзья",
  "main.friendsBody": "Добавляйте друзей и сравнивайте прогресс. Появится позже.",
  "main.settings": "Настройки",
  "main.settingsBody": "Имя, пароль, язык сайта и светлая или тёмная тема.",
  "main.soon": "Скоро",
  "main.guestBanner":
    "Вы проходите тесты как гость. Создайте аккаунт, чтобы история сохранялась на любом устройстве.",
  "main.testsTaken": "Пройдено тестов",
  "main.bestScore": "Лучший результат",
  "main.noTests": "Пока нет тестов",

  "subject.math": "Математика",
  "subject.english": "Английский язык",
  "subject.russian": "Русский язык",

  "landing.logIn": "Войти",
  "landing.signUp": "Регистрация",
  "landing.label": "ПОДГОТОВКА К ЭКЗАМЕНАМ 9 КЛАССА",
  "landing.titleLead": "ДОСТИГНИТЕ СВОЕЙ",
  "landing.titlePeak": "ВЕРШИНЫ.",
  "landing.intro":
    "ExamPeak помогает девятиклассникам готовиться к выпускным экзаменам: пробные тесты, ежедневные викторины и подробные результаты.",
  "landing.introMore":
    "Тренируйтесь по предметам и уровням сложности, находите слабые темы и следите за своим прогрессом.",
  "landing.mockTests": "Пробные тесты",
  "landing.mockTestsBody":
    "Составляйте тренировочные тесты по предмету, теме и сложности из заданий в формате экзамена 9 класса.",
  "landing.dailyQuizzes": "Ежедневные викторины",
  "landing.dailyQuizzesBody":
    "Проходите новые задания каждый день: с каждым разом они становятся сложнее.",
  "landing.trackProgress": "Ваш прогресс",
  "landing.trackProgressBody":
    "Смотрите свои баллы, историю тестов и ошибки, чтобы понять, над чем ещё стоит поработать.",
  "landing.closing":
    "Всё в одном месте: тренируйтесь, следите за прогрессом и уверенно готовьтесь к выпускным экзаменам 9 класса.",

  "settings.title": "Настройки",
  "settings.subtitle": "Ваш аккаунт и внешний вид сайта.",
  "settings.profile": "Профиль",
  "settings.name": "Имя",
  "settings.email": "Электронная почта",
  "settings.emailHint": "Адрес электронной почты пока нельзя изменить здесь.",
  "settings.saveName": "Сохранить имя",
  "settings.nameSaved": "Имя обновлено.",
  "settings.password": "Пароль",
  "settings.newPassword": "Новый пароль",
  "settings.confirmPassword": "Повторите новый пароль",
  "settings.savePassword": "Изменить пароль",
  "settings.passwordSaved": "Пароль обновлён.",
  "settings.passwordMismatch": "Пароли не совпадают.",
  "settings.appearance": "Внешний вид",
  "settings.theme": "Тема",
  "settings.themeLight": "Светлая",
  "settings.themeDark": "Тёмная",
  "settings.language": "Язык",
  "settings.languageHint": "Меняет язык сайта сразу.",
  "settings.signedOut": "Войдите, чтобы изменить имя или пароль.",
  "settings.signInCta": "Войти",
  "settings.notConfigured":
    "Аккаунты пока не подключены, так как Supabase не настроен.",

  "common.saving": "Сохранение...",
  "common.back": "Назад"
};

const az: Dictionary = {
  "nav.newTest": "Yeni test",
  "nav.history": "Tarixçə",
  "nav.settings": "Tənzimləmələr",
  "nav.signIn": "Daxil ol",
  "nav.signOut": "Çıxış",
  "nav.darkMode": "Qaranlıq rejim",
  "nav.lightMode": "İşıqlı rejim",
  "nav.admin": "Admin paneli",
  "nav.menu": "Menyu",

  "main.greeting": "Yenidən xoş gəldiniz",
  "main.greetingGuest": "Exampeak-ə xoş gəldiniz",
  "main.eyebrow": "9-cu sinif buraxılış imtahanlarına hazırlıq",
  "main.startPractice": "Sınaq testinə başla",
  "main.noAccountNeeded": "Hesab tələb olunmur",
  "main.subjectsTitle": "Birbaşa fənnə keçin",
  "main.lede":
    "Keçmiş illərin suallarından sınaq testi qurun, əvvəldən sona qədər həll edin və sonda balınızı, səhvlərinizi və hər birinin səbəbini görün.",
  "main.createTest": "Sınaq testi yarat",
  "main.createTestBody":
    "Fənn və mövzuları seçin, çətinlik dərəcəsini seçin və ya öz uzunluğunuzu və taymerinizi təyin edin.",
  "main.history": "Test tarixçəsi",
  "main.historyBody": "İştirak etdiyiniz bütün testlər, ən yaxşı nəticəniz və səhvləriniz.",
  "main.friends": "Dostlar",
  "main.friendsBody": "Dost əlavə edin və nəticələri müqayisə edin. Daha sonra əlavə olunacaq.",
  "main.settings": "Tənzimləmələr",
  "main.settingsBody": "Adınız, şifrəniz, saytın dili və işıqlı ya qaranlıq rejim.",
  "main.soon": "Tezliklə",
  "main.guestBanner":
    "Testləri qonaq kimi həll edirsiniz. Tarixçənizin hər cihazda saxlanması üçün hesab yaradın.",
  "main.testsTaken": "Həll edilmiş testlər",
  "main.bestScore": "Ən yaxşı nəticə",
  "main.noTests": "Hələ test yoxdur",

  "subject.math": "Riyaziyyat",
  "subject.english": "İngilis dili",
  "subject.russian": "Rus dili",

  "landing.logIn": "Daxil ol",
  "landing.signUp": "Qeydiyyat",
  "landing.label": "9-CU SİNİF İMTAHANLARINA HAZIRLIQ",
  "landing.titleLead": "ZİRVƏNİZƏ",
  "landing.titlePeak": "ÇATIN.",
  "landing.intro":
    "ExamPeak 9-cu sinif şagirdlərinə sınaq testləri, gündəlik viktorinalar və ətraflı nəticələrlə buraxılış imtahanlarına hazırlaşmağa kömək edir.",
  "landing.introMore":
    "Fənn və çətinlik səviyyəsinə görə məşq edin, zəif mövzuları tapın və inkişafınızı izləyin.",
  "landing.mockTests": "Sınaq testləri",
  "landing.mockTestsBody":
    "9-cu sinif imtahan formatında suallarla fənn, mövzu və çətinliyə görə məşq testləri yaradın.",
  "landing.dailyQuizzes": "Gündəlik viktorinalar",
  "landing.dailyQuizzesBody":
    "Hər gün yeni tapşırıqları yerinə yetirin: onlar getdikcə çətinləşir.",
  "landing.trackProgress": "İnkişafınız",
  "landing.trackProgressBody":
    "Nəyi yaxşılaşdıra biləcəyinizi görmək üçün ballarınıza, test tarixçənizə və səhvlərinizə baxın.",
  "landing.closing":
    "Məşq etmək, inkişafınızı ölçmək və 9-cu sinif buraxılış imtahanlarına inamla hazırlaşmaq üçün hər şey bir yerdə.",

  "settings.title": "Tənzimləmələr",
  "settings.subtitle": "Hesabınız və saytın görünüşü.",
  "settings.profile": "Profil",
  "settings.name": "Ad",
  "settings.email": "E-poçt",
  "settings.emailHint": "E-poçt ünvanını hələlik buradan dəyişmək olmur.",
  "settings.saveName": "Adı yadda saxla",
  "settings.nameSaved": "Ad yeniləndi.",
  "settings.password": "Şifrə",
  "settings.newPassword": "Yeni şifrə",
  "settings.confirmPassword": "Yeni şifrəni təsdiqləyin",
  "settings.savePassword": "Şifrəni dəyiş",
  "settings.passwordSaved": "Şifrə yeniləndi.",
  "settings.passwordMismatch": "Şifrələr uyğun gəlmir.",
  "settings.appearance": "Görünüş",
  "settings.theme": "Rejim",
  "settings.themeLight": "İşıqlı",
  "settings.themeDark": "Qaranlıq",
  "settings.language": "Dil",
  "settings.languageHint": "Saytın dilini dərhal dəyişir.",
  "settings.signedOut": "Adınızı və ya şifrənizi dəyişmək üçün daxil olun.",
  "settings.signInCta": "Daxil ol",
  "settings.notConfigured":
    "Supabase qoşulmadığı üçün hesablar hələ aktiv deyil.",

  "common.saving": "Yadda saxlanılır...",
  "common.back": "Geri"
};

const dictionaries: Record<Language, Dictionary> = { en, ru, az };

export function getStoredLanguage(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "ru" || stored === "az") return stored;

  // Fall back to the browser's language when it is one we speak.
  const browser = window.navigator.language.slice(0, 2).toLowerCase();
  if (browser === "ru" || browser === "az") return browser;
  return "en";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    // Screen readers and browser translation both key off this.
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => setLanguageState(next), []);

  const t = useCallback((key: TranslationKey) => dictionaries[language][key] ?? en[key], [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside a LanguageProvider.");
  return context;
}

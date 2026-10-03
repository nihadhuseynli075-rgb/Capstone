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
  "nav.home": "Home",
  "nav.dashboard": "Dashboard",
  "nav.newTest": "New test",
  "nav.history": "History",
  "nav.settings": "Settings",
  "nav.profile": "Profile",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.admin": "Admin dashboard",
  "nav.menu": "Menu",
  "footer.tagline": "Exampeak - Grade 9 mock test practice",

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
  "main.friendsBody": "Add friends by email or username and compare your results.",
  "main.settings": "Settings",
  "main.settingsBody": "The site language, and light or dark mode.",
  "main.soon": "Coming soon",
  "main.guestBanner":
    "You are taking tests as a guest. Create an account to keep your history on any device.",
  "main.testsTaken": "Tests taken",
  "main.bestScore": "Best score",
  "main.noTests": "No tests yet",

  "subject.math": "Maths",
  "subject.english": "English",
  "subject.russian": "Russian",

  // Header and dashboard
  // The theme button's label says what a tap does, so it names the other theme.
  "nav.themeToDark": "Switch to dark mode",
  "nav.themeToLight": "Switch to light mode",
  "main.profileBody": "Your name, your photo and the ways you sign in.",

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
  "settings.subtitle": "How the site looks on this device, and where your account lives.",
  "settings.account": "Account",
  "settings.accountBody": "Your name, photo, password and ways to sign in are all on your profile.",
  "settings.openProfile": "Go to your profile",
  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.language": "Language",
  "settings.languageHint": "Changes the site straight away.",
  "settings.signedOut": "Sign in to change your name, photo or password.",
  "settings.signInCta": "Sign in",
  "settings.notConfigured":
    "Accounts are not switched on yet because Supabase is not connected.",

  "profile.title": "Your profile",
  "profile.subtitle": "Your name and photo, the ways you sign in, and your account.",
  "profile.signedOut": "Sign in to see your profile.",
  "profile.loading": "Loading your profile...",
  "profile.unavailable":
    "Changes to your name, photo and account cannot be saved right now, because the server is not connected to the database yet.",
  "profile.retry": "Try again",
  "profile.memberSince": "Member since",
  "profile.cancel": "Cancel",

  "profile.photo": "Profile photo",
  "profile.photoHint": "Any photo works. It is cropped to a square and made smaller before it is uploaded.",
  "profile.uploadPhoto": "Upload a photo",
  "profile.changePhoto": "Change photo",
  "profile.removePhoto": "Remove photo",
  "profile.savePhoto": "Save photo",
  "profile.preparing": "Getting it ready...",
  "profile.removing": "Removing...",
  "profile.previewHint": "This is how your new photo will look. Save it to use it.",
  "profile.photoSaved": "Photo updated.",
  "profile.photoRemoved": "Photo removed.",
  "profile.photoNotImage": "That file is not a picture. Choose a photo instead.",
  "profile.photoTooLarge": "That file is too big. Choose a photo under 15 MB.",
  "profile.photoUnreadable": "That picture could not be opened. Try a JPG or PNG.",

  "profile.details": "Your details",
  "profile.name": "Name",
  "profile.email": "Email",
  "profile.emailHint": "Your email address cannot be changed here yet.",
  "profile.saveName": "Save name",
  "profile.nameSaved": "Name updated.",

  "profile.signInMethods": "Ways to sign in",
  "profile.methodsHint": "However you sign in, it is the same account with the same history.",
  "profile.methodEmail": "Email and password",
  "profile.methodEmailOff": "Set a password below to sign in with your email address as well.",
  "profile.methodGoogleOff": "Connect Google to sign in with one tap.",
  "profile.connected": "Connected",
  "profile.connectGoogle": "Connect Google",
  "profile.disconnectGoogle": "Disconnect",
  "profile.openingGoogle": "Opening Google...",
  "profile.disconnectConfirm":
    "Disconnect Google? After this you will need your email and password to sign in.",
  "profile.googleConnected": "Google is connected. Next time you can sign in with it.",
  "profile.googleDisconnected": "Google is disconnected.",

  "profile.password": "Password",
  "profile.passwordHint": "At least 8 characters, with a letter and a number.",
  "profile.passwordGoogleOnly":
    "You sign in with Google. Setting a password lets you sign in with your email address as well.",
  "profile.newPassword": "New password",
  "profile.confirmPassword": "Confirm new password",
  "profile.savePassword": "Save password",
  "profile.passwordSaved": "Password updated.",
  "profile.passwordMismatch": "Those two passwords do not match.",

  "profile.deleteTitle": "Delete account",
  "profile.deleteBody":
    "This permanently deletes your profile, your photo and every test you have taken. It cannot be undone.",
  "profile.deleteStart": "Delete my account",
  "profile.deleteConfirmLabel": "To confirm, type your email address",
  "profile.deleteConfirm": "Delete my account for good",
  "profile.deleting": "Deleting...",
  "profile.deleteMismatch": "That does not match your email address.",
  "profile.deletedTitle": "Your account has been deleted",
  "profile.deletedBody":
    "Your profile, your photo and your test history are gone. You can still take tests as a guest whenever you like.",
  "profile.backHome": "Back to the home page",

  // Translations
  "translations.title": "Translations",
  "translations.optional": "optional",
  "translations.intro":
    "Maths questions are shown in the language a student has chosen for the site. Above is the question as first written. Add other languages here; where there is no translation, students see the text above.",
  "translations.prompt": "Question text",
  "translations.options": "Options, in the same order as above",
  "translations.optionFor": "translation of",
  "translations.correctOption": "Correct answer",
  "translations.explanation": "Explanation",
  "translations.answer": "Correct answer in this language",
  "translations.answerHint":
    "Only for short answers that read differently, like 26 cm and 26 см. Leave empty to use the answer above.",
  "translations.addOptionsFirst":
    "Fill in the options above first: each translated option is matched to one of them by its position.",
  "translations.errorNoPrompt": "add the question text, or clear everything for this language.",
  "translations.errorOptions": "translate every option shown, or none of them.",
  "translations.listLabel": "Translations",
  "translations.listNone": "none yet",
  "import.dropTitle": "Drop a CSV or TSV file here",
  "import.dropOr": "or",
  "import.choose": "choose a file",
  "import.dropActive": "Drop to load this file",
  "import.loaded": "Loaded",
  "import.loadedHint": "Check it below, then press Import questions.",
  "import.notSheet":
    "That is not a .csv or .tsv file. In Google Sheets choose File, Download, Comma-separated values.",
  "import.empty": "That file is empty.",
  "import.tooBig":
    "That file is over 2 MB, which is far more than a question sheet. Check it is the right one.",
  "import.unreadable": "That file could not be read.",
  "import.firstOnly": "Only one file is loaded at a time, so only the first was used.",
  "import.translationHint":
    "A translation goes in a column with the same name ending in _ru or _en: question_ru, option_a_ru, explanation_ru. See docs/question-format.md.",

  // Friends
  "friends.title": "Friends",
  "friends.subtitle": "Add friends by email or username, and see how your test results compare.",
  "friends.signedOut": "Sign in to add friends and compare your progress.",
  "friends.unavailable":
    "Friends need real accounts, and the server is not connected to the database yet.",
  "friends.loading": "Loading your friends...",
  "friends.retry": "Try again",

  "friends.addTitle": "Add a friend",
  "friends.addLabel": "Email or username",
  "friends.addPlaceholder": "Their email or @username",
  "friends.addHint":
    "They need an ExamPeak account already. They will see your request and can accept or decline it.",
  "friends.send": "Send request",
  "friends.sending": "Sending...",
  "friends.sent": "Request sent to {name}. You will be friends once they accept.",
  "friends.nowFriends": "You and {name} are now friends. They had already sent you a request.",

  "friends.error.invalidLookup": "Enter an email address or a username, without spaces.",
  "friends.error.yourself": "That is your own account. Add a friend instead.",
  "friends.error.noAccount": "No ExamPeak account with that email or username.",
  "friends.error.alreadyFriends": "You are already friends.",
  "friends.error.alreadyRequested": "You have already sent them a request. They have not answered yet.",
  "friends.error.blocked": "A request cannot be sent to that account.",
  "friends.error.gone": "That request is no longer there. The list has been refreshed.",

  "friends.incomingTitle": "Requests for you",
  "friends.outgoingTitle": "Waiting for an answer",
  "friends.accept": "Accept",
  "friends.decline": "Decline",
  "friends.cancel": "Cancel request",

  "friends.listTitle": "Your friends",
  "friends.empty": "No friends yet. Add someone above with their email or username.",
  "friends.since": "Friends since",
  "friends.remove": "Remove",
  "friends.removeConfirm": "Remove {name} from your friends? You will stop seeing each other's progress.",
  "friends.removeYes": "Yes, remove",
  "friends.removeNo": "Keep",

  "friends.compareCaption": "Your progress compared with {name}",
  "friends.you": "You",
  "friends.testsTaken": "Tests taken",
  "friends.bestScore": "Best score",
  "friends.average": "Average",
  "friends.lastActive": "Last test",

  "common.saving": "Saving...",
  "common.back": "Back"
} as const;

export type TranslationKey = keyof typeof en;

type Dictionary = Record<TranslationKey, string>;

const ru: Dictionary = {
  "nav.home": "Главная",
  "nav.dashboard": "Главная",
  "nav.newTest": "Новый тест",
  "nav.history": "История",
  "nav.settings": "Настройки",
  "nav.profile": "Профиль",
  "nav.signIn": "Войти",
  "nav.signOut": "Выйти",
  "nav.admin": "Панель администратора",
  "nav.menu": "Меню",
  "footer.tagline": "Exampeak - пробные тесты для 9 класса",

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
  "main.friendsBody": "Добавляйте друзей по почте или имени пользователя и сравнивайте результаты.",
  "main.settings": "Настройки",
  "main.settingsBody": "Язык сайта и светлая или тёмная тема.",
  "main.soon": "Скоро",
  "main.guestBanner":
    "Вы проходите тесты как гость. Создайте аккаунт, чтобы история сохранялась на любом устройстве.",
  "main.testsTaken": "Пройдено тестов",
  "main.bestScore": "Лучший результат",
  "main.noTests": "Пока нет тестов",

  "subject.math": "Математика",
  "subject.english": "Английский язык",
  "subject.russian": "Русский язык",

  // Header and dashboard
  "nav.themeToDark": "Включить тёмную тему",
  "nav.themeToLight": "Включить светлую тему",
  "main.profileBody": "Ваше имя, фото и способы входа.",

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
  "settings.subtitle": "Как выглядит сайт на этом устройстве и где найти ваш аккаунт.",
  "settings.account": "Аккаунт",
  "settings.accountBody": "Имя, фото, пароль и способы входа находятся в вашем профиле.",
  "settings.openProfile": "Перейти в профиль",
  "settings.appearance": "Внешний вид",
  "settings.theme": "Тема",
  "settings.themeLight": "Светлая",
  "settings.themeDark": "Тёмная",
  "settings.language": "Язык",
  "settings.languageHint": "Меняет язык сайта сразу.",
  "settings.signedOut": "Войдите, чтобы изменить имя, фото или пароль.",
  "settings.signInCta": "Войти",
  "settings.notConfigured":
    "Аккаунты пока не подключены, так как Supabase не настроен.",

  "profile.title": "Ваш профиль",
  "profile.subtitle": "Ваше имя и фото, способы входа и ваш аккаунт.",
  "profile.signedOut": "Войдите, чтобы увидеть свой профиль.",
  "profile.loading": "Загружаем профиль...",
  "profile.unavailable":
    "Изменения имени, фото и аккаунта сейчас нельзя сохранить: сервер ещё не подключён к базе данных.",
  "profile.retry": "Попробовать снова",
  "profile.memberSince": "Аккаунт создан",
  "profile.cancel": "Отмена",

  "profile.photo": "Фото профиля",
  "profile.photoHint": "Подойдёт любое фото. Перед загрузкой оно обрезается до квадрата и уменьшается.",
  "profile.uploadPhoto": "Загрузить фото",
  "profile.changePhoto": "Сменить фото",
  "profile.removePhoto": "Удалить фото",
  "profile.savePhoto": "Сохранить фото",
  "profile.preparing": "Подготовка...",
  "profile.removing": "Удаление...",
  "profile.previewHint": "Так будет выглядеть новое фото. Сохраните его, чтобы использовать.",
  "profile.photoSaved": "Фото обновлено.",
  "profile.photoRemoved": "Фото удалено.",
  "profile.photoNotImage": "Этот файл не изображение. Выберите фото.",
  "profile.photoTooLarge": "Файл слишком большой. Выберите фото меньше 15 МБ.",
  "profile.photoUnreadable": "Не удалось открыть это изображение. Попробуйте JPG или PNG.",

  "profile.details": "Ваши данные",
  "profile.name": "Имя",
  "profile.email": "Электронная почта",
  "profile.emailHint": "Адрес электронной почты пока нельзя изменить здесь.",
  "profile.saveName": "Сохранить имя",
  "profile.nameSaved": "Имя обновлено.",

  "profile.signInMethods": "Способы входа",
  "profile.methodsHint": "Каким бы способом вы ни вошли, это один и тот же аккаунт с той же историей.",
  "profile.methodEmail": "Почта и пароль",
  "profile.methodEmailOff": "Задайте пароль ниже, чтобы входить и по адресу электронной почты.",
  "profile.methodGoogleOff": "Подключите Google, чтобы входить в одно касание.",
  "profile.connected": "Подключено",
  "profile.connectGoogle": "Подключить Google",
  "profile.disconnectGoogle": "Отключить",
  "profile.openingGoogle": "Открываем Google...",
  "profile.disconnectConfirm":
    "Отключить Google? После этого для входа понадобятся почта и пароль.",
  "profile.googleConnected": "Google подключён. В следующий раз можно войти через него.",
  "profile.googleDisconnected": "Google отключён.",

  "profile.password": "Пароль",
  "profile.passwordHint": "Не меньше 8 символов, хотя бы одна буква и одна цифра.",
  "profile.passwordGoogleOnly":
    "Вы входите через Google. Если задать пароль, можно будет входить и по адресу электронной почты.",
  "profile.newPassword": "Новый пароль",
  "profile.confirmPassword": "Повторите новый пароль",
  "profile.savePassword": "Сохранить пароль",
  "profile.passwordSaved": "Пароль обновлён.",
  "profile.passwordMismatch": "Пароли не совпадают.",

  "profile.deleteTitle": "Удаление аккаунта",
  "profile.deleteBody":
    "Ваш профиль, фото и все пройденные тесты будут удалены навсегда. Это нельзя отменить.",
  "profile.deleteStart": "Удалить аккаунт",
  "profile.deleteConfirmLabel": "Для подтверждения введите свой адрес электронной почты",
  "profile.deleteConfirm": "Удалить аккаунт навсегда",
  "profile.deleting": "Удаление...",
  "profile.deleteMismatch": "Это не совпадает с вашим адресом электронной почты.",
  "profile.deletedTitle": "Ваш аккаунт удалён",
  "profile.deletedBody":
    "Ваш профиль, фото и история тестов удалены. Вы по-прежнему можете проходить тесты как гость.",
  "profile.backHome": "На главную",

  // Translations
  "translations.title": "Переводы",
  "translations.optional": "необязательно",
  "translations.intro":
    "Задания по математике показываются на языке, который ученик выбрал для сайта. Выше задание в том виде, в каком оно было написано. Добавьте здесь другие языки; если перевода нет, ученик видит текст выше.",
  "translations.prompt": "Текст задания",
  "translations.options": "Варианты ответа, в том же порядке, что и выше",
  "translations.optionFor": "перевод варианта",
  "translations.correctOption": "Верный ответ",
  "translations.explanation": "Объяснение",
  "translations.answer": "Верный ответ на этом языке",
  "translations.answerHint":
    "Нужен только для коротких ответов, которые пишутся по-разному, например 26 cm и 26 см. Если оставить пустым, берётся ответ выше.",
  "translations.addOptionsFirst":
    "Сначала заполните варианты ответа выше: каждый переведённый вариант сопоставляется с одним из них по порядку.",
  "translations.errorNoPrompt": "добавьте текст задания или очистите все поля для этого языка.",
  "translations.errorOptions": "переведите все показанные варианты или ни одного.",
  "translations.listLabel": "Переводы",
  "translations.listNone": "пока нет",
  "import.dropTitle": "Перетащите сюда файл CSV или TSV",
  "import.dropOr": "или",
  "import.choose": "выберите файл",
  "import.dropActive": "Отпустите, чтобы загрузить файл",
  "import.loaded": "Загружено",
  "import.loadedHint": "Проверьте текст ниже и нажмите Import questions.",
  "import.notSheet":
    "Это не файл .csv или .tsv. В Google Таблицах выберите «Файл», «Скачать», «Значения, разделённые запятыми».",
  "import.empty": "Этот файл пуст.",
  "import.tooBig":
    "Файл больше 2 МБ, а это намного больше, чем таблица с вопросами. Проверьте, тот ли это файл.",
  "import.unreadable": "Не удалось прочитать этот файл.",
  "import.firstOnly": "Загружается один файл за раз, поэтому использован только первый.",
  "import.translationHint":
    "Перевод добавляется в столбец с тем же названием и окончанием _ru или _en: question_ru, option_a_ru, explanation_ru. Подробности в docs/question-format.md.",

  // Friends
  "friends.title": "Друзья",
  "friends.subtitle":
    "Добавляйте друзей по электронной почте или имени пользователя и сравнивайте результаты тестов.",
  "friends.signedOut": "Войдите, чтобы добавлять друзей и сравнивать прогресс.",
  "friends.unavailable":
    "Для друзей нужны настоящие аккаунты, а сервер пока не подключён к базе данных.",
  "friends.loading": "Загружаем друзей...",
  "friends.retry": "Попробовать снова",

  "friends.addTitle": "Добавить друга",
  "friends.addLabel": "Почта или имя пользователя",
  "friends.addPlaceholder": "Почта или @имя_пользователя",
  "friends.addHint":
    "У этого человека уже должен быть аккаунт ExamPeak. Он увидит ваш запрос и сможет принять или отклонить его.",
  "friends.send": "Отправить запрос",
  "friends.sending": "Отправляем...",
  "friends.sent": "Запрос отправлен: {name}. Вы станете друзьями, когда его примут.",
  "friends.nowFriends": "Вы и {name} теперь друзья: этот человек уже присылал вам запрос.",

  "friends.error.invalidLookup": "Введите адрес электронной почты или имя пользователя без пробелов.",
  "friends.error.yourself": "Это ваш собственный аккаунт. Добавьте кого-нибудь другого.",
  "friends.error.noAccount": "Нет аккаунта ExamPeak с такой почтой или таким именем пользователя.",
  "friends.error.alreadyFriends": "Вы уже друзья.",
  "friends.error.alreadyRequested": "Вы уже отправили запрос. Ответа пока нет.",
  "friends.error.blocked": "Этому аккаунту нельзя отправить запрос.",
  "friends.error.gone": "Этого запроса больше нет. Список обновлён.",

  "friends.incomingTitle": "Запросы к вам",
  "friends.outgoingTitle": "Ждут ответа",
  "friends.accept": "Принять",
  "friends.decline": "Отклонить",
  "friends.cancel": "Отменить запрос",

  "friends.listTitle": "Ваши друзья",
  "friends.empty": "Друзей пока нет. Добавьте кого-нибудь выше по почте или имени пользователя.",
  "friends.since": "Друзья с",
  "friends.remove": "Удалить",
  "friends.removeConfirm": "Удалить {name} из друзей? Вы перестанете видеть прогресс друг друга.",
  "friends.removeYes": "Да, удалить",
  "friends.removeNo": "Оставить",

  "friends.compareCaption": "Ваш прогресс в сравнении с {name}",
  "friends.you": "Вы",
  "friends.testsTaken": "Пройдено тестов",
  "friends.bestScore": "Лучший результат",
  "friends.average": "Средний результат",
  "friends.lastActive": "Последний тест",

  "common.saving": "Сохранение...",
  "common.back": "Назад"
};

const az: Dictionary = {
  "nav.home": "Ana səhifə",
  "nav.dashboard": "Ana səhifə",
  "nav.newTest": "Yeni test",
  "nav.history": "Tarixçə",
  "nav.settings": "Tənzimləmələr",
  "nav.profile": "Profil",
  "nav.signIn": "Daxil ol",
  "nav.signOut": "Çıxış",
  "nav.admin": "Admin paneli",
  "nav.menu": "Menyu",
  "footer.tagline": "Exampeak - 9-cu sinif üçün sınaq testləri",

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
  "main.friendsBody": "E-poçt və ya istifadəçi adı ilə dost əlavə edin və nəticələri müqayisə edin.",
  "main.settings": "Tənzimləmələr",
  "main.settingsBody": "Saytın dili və işıqlı ya qaranlıq rejim.",
  "main.soon": "Tezliklə",
  "main.guestBanner":
    "Testləri qonaq kimi həll edirsiniz. Tarixçənizin hər cihazda saxlanması üçün hesab yaradın.",
  "main.testsTaken": "Həll edilmiş testlər",
  "main.bestScore": "Ən yaxşı nəticə",
  "main.noTests": "Hələ test yoxdur",

  "subject.math": "Riyaziyyat",
  "subject.english": "İngilis dili",
  "subject.russian": "Rus dili",

  // Header and dashboard
  "nav.themeToDark": "Qaranlıq rejimə keç",
  "nav.themeToLight": "İşıqlı rejimə keç",
  "main.profileBody": "Adınız, şəkliniz və giriş üsulları.",

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
  "settings.subtitle": "Saytın bu cihazda görünüşü və hesabınızın harada olduğu.",
  "settings.account": "Hesab",
  "settings.accountBody": "Adınız, şəkliniz, şifrəniz və giriş üsullarınız profilinizdədir.",
  "settings.openProfile": "Profilə keçin",
  "settings.appearance": "Görünüş",
  "settings.theme": "Rejim",
  "settings.themeLight": "İşıqlı",
  "settings.themeDark": "Qaranlıq",
  "settings.language": "Dil",
  "settings.languageHint": "Saytın dilini dərhal dəyişir.",
  "settings.signedOut": "Adınızı, şəklinizi və ya şifrənizi dəyişmək üçün daxil olun.",
  "settings.signInCta": "Daxil ol",
  "settings.notConfigured":
    "Supabase qoşulmadığı üçün hesablar hələ aktiv deyil.",

  "profile.title": "Profiliniz",
  "profile.subtitle": "Adınız və şəkliniz, giriş üsullarınız və hesabınız.",
  "profile.signedOut": "Profilinizi görmək üçün daxil olun.",
  "profile.loading": "Profiliniz yüklənir...",
  "profile.unavailable":
    "Server hələ verilənlər bazasına qoşulmadığı üçün adınız, şəkliniz və hesabınızla bağlı dəyişiklikləri indi yadda saxlamaq mümkün deyil.",
  "profile.retry": "Yenidən cəhd edin",
  "profile.memberSince": "Qeydiyyat tarixi:",
  "profile.cancel": "Ləğv et",

  "profile.photo": "Profil şəkli",
  "profile.photoHint": "İstənilən şəkil olar. Yükləmədən əvvəl kvadrat şəklində kəsilir və kiçildilir.",
  "profile.uploadPhoto": "Şəkil yüklə",
  "profile.changePhoto": "Şəkli dəyiş",
  "profile.removePhoto": "Şəkli sil",
  "profile.savePhoto": "Şəkli yadda saxla",
  "profile.preparing": "Hazırlanır...",
  "profile.removing": "Silinir...",
  "profile.previewHint": "Yeni şəkliniz belə görünəcək. İstifadə etmək üçün yadda saxlayın.",
  "profile.photoSaved": "Şəkil yeniləndi.",
  "profile.photoRemoved": "Şəkil silindi.",
  "profile.photoNotImage": "Bu fayl şəkil deyil. Zəhmət olmasa şəkil seçin.",
  "profile.photoTooLarge": "Bu fayl çox böyükdür. 15 MB-dan kiçik şəkil seçin.",
  "profile.photoUnreadable": "Bu şəkli açmaq mümkün olmadı. JPG və ya PNG sınayın.",

  "profile.details": "Məlumatlarınız",
  "profile.name": "Ad",
  "profile.email": "E-poçt",
  "profile.emailHint": "E-poçt ünvanını hələlik buradan dəyişmək olmur.",
  "profile.saveName": "Adı yadda saxla",
  "profile.nameSaved": "Ad yeniləndi.",

  "profile.signInMethods": "Giriş üsulları",
  "profile.methodsHint": "Hansı üsulla daxil olsanız da, hesabınız və tarixçəniz eyni qalır.",
  "profile.methodEmail": "E-poçt və şifrə",
  "profile.methodEmailOff": "E-poçt ünvanınızla da daxil olmaq üçün aşağıda şifrə təyin edin.",
  "profile.methodGoogleOff": "Bir toxunuşla daxil olmaq üçün Google-u qoşun.",
  "profile.connected": "Qoşulub",
  "profile.connectGoogle": "Google-u qoş",
  "profile.disconnectGoogle": "Ayır",
  "profile.openingGoogle": "Google açılır...",
  "profile.disconnectConfirm":
    "Google ayrılsın? Bundan sonra daxil olmaq üçün e-poçtunuz və şifrəniz lazım olacaq.",
  "profile.googleConnected": "Google qoşuldu. Növbəti dəfə onunla daxil ola bilərsiniz.",
  "profile.googleDisconnected": "Google ayrıldı.",

  "profile.password": "Şifrə",
  "profile.passwordHint": "Ən azı 8 simvol, ən azı bir hərf və bir rəqəm.",
  "profile.passwordGoogleOnly":
    "Siz Google ilə daxil olursunuz. Şifrə təyin etsəniz, e-poçt ünvanınızla da daxil ola bilərsiniz.",
  "profile.newPassword": "Yeni şifrə",
  "profile.confirmPassword": "Yeni şifrəni təsdiqləyin",
  "profile.savePassword": "Şifrəni yadda saxla",
  "profile.passwordSaved": "Şifrə yeniləndi.",
  "profile.passwordMismatch": "Şifrələr uyğun gəlmir.",

  "profile.deleteTitle": "Hesabın silinməsi",
  "profile.deleteBody":
    "Bu, profilinizi, şəklinizi və həll etdiyiniz bütün testləri həmişəlik silir. Bunu geri qaytarmaq olmur.",
  "profile.deleteStart": "Hesabımı sil",
  "profile.deleteConfirmLabel": "Təsdiqləmək üçün e-poçt ünvanınızı yazın",
  "profile.deleteConfirm": "Hesabımı həmişəlik sil",
  "profile.deleting": "Silinir...",
  "profile.deleteMismatch": "Bu, e-poçt ünvanınızla uyğun gəlmir.",
  "profile.deletedTitle": "Hesabınız silindi",
  "profile.deletedBody":
    "Profiliniz, şəkliniz və test tarixçəniz silindi. İstədiyiniz vaxt qonaq kimi test həll etməyə davam edə bilərsiniz.",
  "profile.backHome": "Ana səhifəyə qayıt",

  // Translations
  "translations.title": "Tərcümələr",
  "translations.optional": "ixtiyari",
  "translations.intro":
    "Riyaziyyat tapşırıqları şagirdin sayt üçün seçdiyi dildə göstərilir. Yuxarıda tapşırıq ilkin yazıldığı kimidir. Digər dilləri burada əlavə edin; tərcümə olmayan dildə şagird yuxarıdakı mətni görür.",
  "translations.prompt": "Tapşırığın mətni",
  "translations.options": "Cavab variantları, yuxarıdakı ilə eyni sıra ilə",
  "translations.optionFor": "variantın tərcüməsi",
  "translations.correctOption": "Düzgün cavab",
  "translations.explanation": "İzah",
  "translations.answer": "Bu dildə düzgün cavab",
  "translations.answerHint":
    "Yalnız fərqli yazılan qısa cavablar üçündür, məsələn, 26 cm və 26 см. Boş buraxsanız, yuxarıdakı cavab götürülür.",
  "translations.addOptionsFirst":
    "Əvvəlcə yuxarıdakı cavab variantlarını doldurun: tərcümə olunmuş hər variant sıra ilə onlardan biri ilə uyğunlaşdırılır.",
  "translations.errorNoPrompt": "tapşırığın mətnini əlavə edin və ya bu dil üçün bütün sahələri silin.",
  "translations.errorOptions": "göstərilən bütün variantları tərcümə edin və ya heç birini.",
  "translations.listLabel": "Tərcümələr",
  "translations.listNone": "hələ yoxdur",
  "import.dropTitle": "CSV və ya TSV faylını bura sürüşdürün",
  "import.dropOr": "və ya",
  "import.choose": "fayl seçin",
  "import.dropActive": "Faylı yükləmək üçün buraxın",
  "import.loaded": "Yükləndi",
  "import.loadedHint": "Aşağıdakı mətni yoxlayın, sonra Import questions düyməsini basın.",
  "import.notSheet":
    ".csv və ya .tsv faylı deyil. Google Cədvəllərdə Fayl, Yüklə, Vergüllə ayrılmış dəyərlər seçin.",
  "import.empty": "Bu fayl boşdur.",
  "import.tooBig":
    "Fayl 2 MB-dan böyükdür, bu isə sual cədvəlindən xeyli böyükdür. Düzgün fayl olduğunu yoxlayın.",
  "import.unreadable": "Bu faylı oxumaq mümkün olmadı.",
  "import.firstOnly": "Eyni anda yalnız bir fayl yüklənir, ona görə yalnız birincisi istifadə olundu.",
  "import.translationHint":
    "Tərcümə eyni adlı, lakin sonu _ru və ya _en olan sütunda yazılır: question_ru, option_a_ru, explanation_ru. Ətraflı: docs/question-format.md.",

  // Friends
  "friends.title": "Dostlar",
  "friends.subtitle":
    "Dostları e-poçt və ya istifadəçi adı ilə əlavə edin və test nəticələrinizi müqayisə edin.",
  "friends.signedOut": "Dost əlavə etmək və inkişafınızı müqayisə etmək üçün daxil olun.",
  "friends.unavailable":
    "Dostlar üçün real hesablar lazımdır, server isə hələ verilənlər bazasına qoşulmayıb.",
  "friends.loading": "Dostlarınız yüklənir...",
  "friends.retry": "Yenidən cəhd edin",

  "friends.addTitle": "Dost əlavə et",
  "friends.addLabel": "E-poçt və ya istifadəçi adı",
  "friends.addPlaceholder": "E-poçt və ya @istifadəçi_adı",
  "friends.addHint":
    "Onun artıq ExamPeak hesabı olmalıdır. O, sorğunuzu görəcək və qəbul edə və ya rədd edə biləcək.",
  "friends.send": "Sorğu göndər",
  "friends.sending": "Göndərilir...",
  "friends.sent": "Sorğu göndərildi: {name}. Qəbul ediləndə dost olacaqsınız.",
  "friends.nowFriends": "Siz və {name} artıq dostsunuz: o, əvvəlcədən sizə sorğu göndərmişdi.",

  "friends.error.invalidLookup": "Boşluqsuz e-poçt ünvanı və ya istifadəçi adı daxil edin.",
  "friends.error.yourself": "Bu sizin öz hesabınızdır. Başqasını əlavə edin.",
  "friends.error.noAccount": "Bu e-poçt və ya istifadəçi adı ilə ExamPeak hesabı yoxdur.",
  "friends.error.alreadyFriends": "Siz artıq dostsunuz.",
  "friends.error.alreadyRequested": "Siz artıq sorğu göndərmisiniz. Hələ cavab verilməyib.",
  "friends.error.blocked": "Bu hesaba sorğu göndərmək mümkün deyil.",
  "friends.error.gone": "Bu sorğu artıq yoxdur. Siyahı yeniləndi.",

  "friends.incomingTitle": "Sizə gələn sorğular",
  "friends.outgoingTitle": "Cavab gözləyənlər",
  "friends.accept": "Qəbul et",
  "friends.decline": "Rədd et",
  "friends.cancel": "Sorğunu ləğv et",

  "friends.listTitle": "Dostlarınız",
  "friends.empty": "Hələ dostunuz yoxdur. Yuxarıda e-poçt və ya istifadəçi adı ilə kimisə əlavə edin.",
  "friends.since": "Dostluğun başlanğıcı:",
  "friends.remove": "Sil",
  "friends.removeConfirm": "{name} dostlarınızdan silinsin? Bir-birinizin nəticələrini görməyəcəksiniz.",
  "friends.removeYes": "Bəli, sil",
  "friends.removeNo": "Saxla",

  "friends.compareCaption": "Nəticələrinizin {name} ilə müqayisəsi",
  "friends.you": "Siz",
  "friends.testsTaken": "Həll edilmiş testlər",
  "friends.bestScore": "Ən yaxşı nəticə",
  "friends.average": "Orta nəticə",
  "friends.lastActive": "Son test",

  "common.saving": "Yadda saxlanılır...",
  "common.back": "Geri"
};

const dictionaries: Record<Language, Dictionary> = { en, ru, az };

/** Written out by hand: Chrome ships without Azerbaijani date formats. */
const AZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avqust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr"
];

/**
 * A day in the site language: "September 23, 2026", "23 сентября 2026 г.",
 * "23 sentyabr 2026".
 *
 * The browser's own formatting is used where it can be trusted. Chrome has no
 * Azerbaijani date data and prints "2026 M09 23", so that one is built here.
 */
export function formatDay(iso: string, language: Language): string {
  const date = new Date(iso);
  if (language === "az") return `${date.getDate()} ${AZ_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return date.toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric" });
}

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

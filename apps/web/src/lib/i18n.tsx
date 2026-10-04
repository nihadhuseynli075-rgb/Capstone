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
  // For an account made in the last day, which has nothing to come back to.
  "main.greetingNew": "Welcome",
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

  // The same words the builder, the results and the history use (subjects in
  // packages/shared), so a subject has one name wherever it is read.
  "subject.math": "Mathematics",
  "subject.english": "English",
  "subject.russian": "Russian",

  // Header and dashboard
  // The theme button's label says what a tap does, so it names the other theme.
  "nav.themeToDark": "Switch to dark mode",
  "nav.themeToLight": "Switch to light mode",
  "main.profileBody": "Your name, your photo and the ways you sign in.",

  // The names every other screen gives these two actions. Daily quizzes are
  // left out of the intro until they exist: their card already says "Coming
  // soon". "Practise" is the verb and "practice" the noun, as elsewhere.
  "landing.logIn": "Sign in",
  "landing.signUp": "Create account",
  "landing.label": "GRADE 9 EXAM PREPARATION",
  "landing.titleLead": "REACH YOUR",
  "landing.titlePeak": "PEAK.",
  "landing.intro":
    "Exampeak helps Grade 9 students prepare for final exams through mock tests and detailed results.",
  "landing.introMore":
    "Practise by subject and difficulty, identify weak topics and track your progress as you improve.",
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
  "profile.emailHint": "We email a link to the new address. Your email only changes once you open it.",
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
    "They need an Exampeak account already. They will see your request and can accept or decline it.",
  "friends.send": "Send request",
  "friends.sending": "Sending...",
  "friends.sent": "Request sent to {name}. You will be friends once they accept.",
  "friends.nowFriends": "You and {name} are now friends. They had already sent you a request.",

  "friends.error.invalidLookup": "Enter an email address or a username, without spaces.",
  "friends.error.yourself": "That is your own account. Add a friend instead.",
  "friends.error.noAccount": "No Exampeak account with that email or username.",
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

  // Profile and username
  "profile.nameEmpty": "Enter your name.",
  "profile.nameTooShort": "That name is too short.",
  "profile.nameTooLong": "That name is too long.",

  "profile.emailTitle": "Email address",
  "profile.newEmail": "New email address",
  "profile.changeEmail": "Change email",
  "profile.sendingEmail": "Sending...",
  "profile.emailEmpty": "Enter your email address.",
  "profile.emailInvalid": "That does not look like an email address.",
  "profile.emailSame": "That is already your email address.",
  "profile.emailPending":
    "We sent a confirmation link to {email}. Open that email and press the link. Your address only changes after you do, so until then keep signing in with {current}.",
  "profile.emailPendingNote":
    "You may also get a link at your current address as a safety check. Open that one too.",
  "profile.emailPendingFix": "Typed it wrong? Enter the right address below and send it again.",
  "profile.emailResend": "Send the link again",
  "profile.emailResent": "We sent the link again to {email}.",
  "profile.emailChanged": "Your email address is now {email}.",
  "profile.emailGoogleOnly":
    "Your email address comes from your Google account. Set a password below first, and then you can change it here.",

  "profile.passwordEmpty": "Enter a password.",
  "profile.passwordTooShort": "Use at least 8 characters.",
  "profile.passwordNeedsMix": "Include at least one letter and one number.",
  "profile.showPassword": "Show",
  "profile.hidePassword": "Hide",
  "profile.showPasswordAria": "Show password",
  "profile.hidePasswordAria": "Hide password",

  "profile.errEmailTaken": "Another account already uses that email address.",
  "profile.errEmailInvalid": "That does not look like a valid email address.",
  "profile.errEmailNotAllowed": "We cannot send email to that address yet. Try another one.",
  "profile.errSamePassword": "That is already your password. Pick a different one.",
  "profile.errWeakPassword": "That password is too weak. Use at least 8 characters, with a letter and a number.",
  "profile.errReauth": "For your safety, sign out and sign in again, then try once more.",
  "profile.errRateLimit": "Too many attempts. Wait a minute and try again.",
  "profile.errSignInAgain": "Your sign-in has ended. Sign in again to continue.",
  "profile.errNetwork": "Could not reach the server. Check your internet connection and try again.",
  "profile.errGoogleTaken": "That Google account is already connected to a different Exampeak account.",
  "profile.errLinkingOff": "Connecting Google to an account that already exists is not switched on yet.",
  "profile.errOnlyWay": "Google is the only way into this account, so it cannot be disconnected.",
  "profile.errGoogleOff": "Signing in with Google is not switched on yet.",
  "profile.errLinkCancelled": "Connecting Google was cancelled, so nothing has changed.",
  "profile.errLinkExpired": "That link has expired or has already been used.",
  "profile.errNotConfigured": "Accounts are not switched on yet because Supabase is not connected.",
  "profile.errPhotoSize": "That photo is too big. It must be 2 MB or smaller.",
  "profile.errPhotoType": "Only JPG, PNG or WebP photos can be used.",
  "profile.errPhotoEmpty": "That photo was empty.",
  "profile.errPhotoMissing": "Choose a photo to upload.",
  "profile.errGeneric": "Something went wrong. Try again in a moment.",

  "profile.username": "Username",
  "profile.usernameRules":
    "3 to 20 characters: letters a-z, numbers, _ and a dot. It must start with a letter. Friends find you by this name.",
  "profile.usernameEmpty": "Enter a username.",
  "profile.usernameTooShort": "Use at least 3 characters.",
  "profile.usernameTooLong": "Use at most 20 characters.",
  "profile.usernameBadChars": "Only the letters a-z, numbers, _ and a dot are allowed.",
  "profile.usernameBadStart": "It must start with a letter.",
  "profile.usernameReserved": "That username is reserved. Choose another.",
  "profile.usernameTaken": "That username is taken.",
  "profile.usernameInvalid": "That username cannot be used. Use 3 to 20 letters, numbers, _ or a dot.",
  "profile.usernameAvailable": "@{username} is available.",
  "profile.usernameChecking": "Checking...",
  "profile.usernameYours": "That is your current username.",
  "profile.usernameCheckFailed": "Could not check whether it is free. You can still save it.",
  "profile.usernameSaved": "Username updated.",
  "profile.detailsSaved": "Details updated.",
  "profile.saveDetails": "Save changes",

  "common.saving": "Saving...",
  "common.back": "Back",

  // Page not found
  "notFound.title": "Page not found",
  "notFound.body":
    "There is nothing at this address. The link may have a typing mistake in it, or the page may have moved.",
  "notFound.home": "Go to the home page",
  "notFound.dashboard": "Go to your dashboard",

  // Page titles, shown in the tab and the history as "<page> - Exampeak"
  "title.home": "Grade 9 mock tests",
  "title.dashboard": "Dashboard",
  "title.signIn": "Sign in",
  "title.register": "Create account",
  "title.build": "Create a mock test",
  "title.exam": "Test in progress",
  "title.results": "Results",
  "title.history": "Test history",
  "title.friends": "Friends",
  "title.profile": "Your profile",
  "title.settings": "Settings",
  "title.admin": "Admin dashboard",
  "title.notFound": "Page not found"
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
  "main.greetingNew": "Добро пожаловать",
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
  "landing.signUp": "Создать аккаунт",
  "landing.label": "ПОДГОТОВКА К ЭКЗАМЕНАМ 9 КЛАССА",
  "landing.titleLead": "ДОСТИГНИТЕ СВОЕЙ",
  "landing.titlePeak": "ВЕРШИНЫ.",
  "landing.intro":
    "Exampeak помогает девятиклассникам готовиться к выпускным экзаменам: пробные тесты и подробные результаты.",
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
  "profile.emailHint": "Мы отправим ссылку на новый адрес. Адрес изменится только после того, как вы её откроете.",
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
    "У этого человека уже должен быть аккаунт Exampeak. Он увидит ваш запрос и сможет принять или отклонить его.",
  "friends.send": "Отправить запрос",
  "friends.sending": "Отправляем...",
  "friends.sent": "Запрос отправлен: {name}. Вы станете друзьями, когда его примут.",
  "friends.nowFriends": "Вы и {name} теперь друзья: этот человек уже присылал вам запрос.",

  "friends.error.invalidLookup": "Введите адрес электронной почты или имя пользователя без пробелов.",
  "friends.error.yourself": "Это ваш собственный аккаунт. Добавьте кого-нибудь другого.",
  "friends.error.noAccount": "Нет аккаунта Exampeak с такой почтой или таким именем пользователя.",
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

  // Profile and username
  "profile.nameEmpty": "Введите имя.",
  "profile.nameTooShort": "Слишком короткое имя.",
  "profile.nameTooLong": "Слишком длинное имя.",

  "profile.emailTitle": "Адрес электронной почты",
  "profile.newEmail": "Новый адрес электронной почты",
  "profile.changeEmail": "Сменить адрес",
  "profile.sendingEmail": "Отправка...",
  "profile.emailEmpty": "Введите адрес электронной почты.",
  "profile.emailInvalid": "Это не похоже на адрес электронной почты.",
  "profile.emailSame": "Это уже ваш адрес электронной почты.",
  "profile.emailPending":
    "Мы отправили ссылку для подтверждения на {email}. Откройте письмо и нажмите на ссылку. Адрес изменится только после этого, а до тех пор входите с адресом {current}.",
  "profile.emailPendingNote":
    "Для безопасности ещё одна ссылка может прийти на ваш текущий адрес. Откройте и её.",
  "profile.emailPendingFix": "Ошиблись? Введите правильный адрес ниже и отправьте снова.",
  "profile.emailResend": "Отправить ссылку ещё раз",
  "profile.emailResent": "Мы ещё раз отправили ссылку на {email}.",
  "profile.emailChanged": "Теперь ваш адрес электронной почты: {email}.",
  "profile.emailGoogleOnly":
    "Ваш адрес электронной почты взят из аккаунта Google. Сначала задайте пароль ниже, и тогда сможете изменить адрес здесь.",

  "profile.passwordEmpty": "Введите пароль.",
  "profile.passwordTooShort": "Используйте не меньше 8 символов.",
  "profile.passwordNeedsMix": "Добавьте хотя бы одну букву и одну цифру.",
  "profile.showPassword": "Показать",
  "profile.hidePassword": "Скрыть",
  "profile.showPasswordAria": "Показать пароль",
  "profile.hidePasswordAria": "Скрыть пароль",

  "profile.errEmailTaken": "Этот адрес электронной почты уже используется другим аккаунтом.",
  "profile.errEmailInvalid": "Это не похоже на настоящий адрес электронной почты.",
  "profile.errEmailNotAllowed": "На этот адрес пока нельзя отправлять письма. Попробуйте другой.",
  "profile.errSamePassword": "Это уже ваш пароль. Выберите другой.",
  "profile.errWeakPassword": "Слишком слабый пароль. Используйте не меньше 8 символов, с буквой и цифрой.",
  "profile.errReauth": "В целях безопасности выйдите и войдите снова, а затем повторите.",
  "profile.errRateLimit": "Слишком много попыток. Подождите минуту и попробуйте снова.",
  "profile.errSignInAgain": "Ваш вход завершился. Войдите снова, чтобы продолжить.",
  "profile.errNetwork": "Не удалось связаться с сервером. Проверьте подключение к интернету и попробуйте снова.",
  "profile.errGoogleTaken": "Этот аккаунт Google уже подключён к другому аккаунту Exampeak.",
  "profile.errLinkingOff": "Подключение Google к уже существующему аккаунту пока не включено.",
  "profile.errOnlyWay": "Google — единственный способ входа в этот аккаунт, поэтому его нельзя отключить.",
  "profile.errGoogleOff": "Вход через Google пока не включён.",
  "profile.errLinkCancelled": "Подключение Google отменено, ничего не изменилось.",
  "profile.errLinkExpired": "Срок действия ссылки истёк, или она уже использована.",
  "profile.errNotConfigured": "Аккаунты пока не включены: Supabase не подключён.",
  "profile.errPhotoSize": "Это фото слишком большое. Размер должен быть не больше 2 МБ.",
  "profile.errPhotoType": "Подойдут только фото в формате JPG, PNG или WebP.",
  "profile.errPhotoEmpty": "Это фото пустое.",
  "profile.errPhotoMissing": "Выберите фото для загрузки.",
  "profile.errGeneric": "Что-то пошло не так. Попробуйте ещё раз чуть позже.",

  "profile.username": "Имя пользователя",
  "profile.usernameRules":
    "От 3 до 20 символов: латинские буквы a-z, цифры, _ и точка. Должно начинаться с буквы. По этому имени вас находят друзья.",
  "profile.usernameEmpty": "Введите имя пользователя.",
  "profile.usernameTooShort": "Используйте не меньше 3 символов.",
  "profile.usernameTooLong": "Используйте не больше 20 символов.",
  "profile.usernameBadChars": "Можно использовать только латинские буквы a-z, цифры, _ и точку.",
  "profile.usernameBadStart": "Имя должно начинаться с буквы.",
  "profile.usernameReserved": "Это имя зарезервировано. Выберите другое.",
  "profile.usernameTaken": "Это имя пользователя занято.",
  "profile.usernameInvalid": "Это имя пользователя нельзя использовать. Нужны 3–20 символов: буквы, цифры, _ или точка.",
  "profile.usernameAvailable": "@{username} свободно.",
  "profile.usernameChecking": "Проверяем...",
  "profile.usernameYours": "Это ваше текущее имя пользователя.",
  "profile.usernameCheckFailed": "Не удалось проверить, свободно ли оно. Вы всё равно можете его сохранить.",
  "profile.usernameSaved": "Имя пользователя обновлено.",
  "profile.detailsSaved": "Данные обновлены.",
  "profile.saveDetails": "Сохранить изменения",

  "common.saving": "Сохранение...",
  "common.back": "Назад",

  // Page not found
  "notFound.title": "Страница не найдена",
  "notFound.body":
    "По этому адресу ничего нет. Возможно, в ссылке опечатка или страница переехала.",
  "notFound.home": "На главную",
  "notFound.dashboard": "На главную",

  // Page titles
  "title.home": "Пробные тесты для 9 класса",
  "title.dashboard": "Главная",
  "title.signIn": "Вход",
  "title.register": "Создать аккаунт",
  "title.build": "Новый пробный тест",
  "title.exam": "Идёт тест",
  "title.results": "Результаты",
  "title.history": "История тестов",
  "title.friends": "Друзья",
  "title.profile": "Ваш профиль",
  "title.settings": "Настройки",
  "title.admin": "Панель администратора",
  "title.notFound": "Страница не найдена"
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
  "main.greetingNew": "Xoş gəldiniz",
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
  "landing.signUp": "Hesab yarat",
  "landing.label": "9-CU SİNİF İMTAHANLARINA HAZIRLIQ",
  "landing.titleLead": "ZİRVƏNİZƏ",
  "landing.titlePeak": "ÇATIN.",
  "landing.intro":
    "Exampeak 9-cu sinif şagirdlərinə sınaq testləri və ətraflı nəticələrlə buraxılış imtahanlarına hazırlaşmağa kömək edir.",
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
  "profile.emailHint": "Yeni ünvana link göndəririk. E-poçtunuz yalnız onu açdıqdan sonra dəyişir.",
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
    "Onun artıq Exampeak hesabı olmalıdır. O, sorğunuzu görəcək və qəbul edə və ya rədd edə biləcək.",
  "friends.send": "Sorğu göndər",
  "friends.sending": "Göndərilir...",
  "friends.sent": "Sorğu göndərildi: {name}. Qəbul ediləndə dost olacaqsınız.",
  "friends.nowFriends": "Siz və {name} artıq dostsunuz: o, əvvəlcədən sizə sorğu göndərmişdi.",

  "friends.error.invalidLookup": "Boşluqsuz e-poçt ünvanı və ya istifadəçi adı daxil edin.",
  "friends.error.yourself": "Bu sizin öz hesabınızdır. Başqasını əlavə edin.",
  "friends.error.noAccount": "Bu e-poçt və ya istifadəçi adı ilə Exampeak hesabı yoxdur.",
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

  // Profile and username
  "profile.nameEmpty": "Adınızı daxil edin.",
  "profile.nameTooShort": "Bu ad çox qısadır.",
  "profile.nameTooLong": "Bu ad çox uzundur.",

  "profile.emailTitle": "E-poçt ünvanı",
  "profile.newEmail": "Yeni e-poçt ünvanı",
  "profile.changeEmail": "E-poçtu dəyiş",
  "profile.sendingEmail": "Göndərilir...",
  "profile.emailEmpty": "E-poçt ünvanınızı daxil edin.",
  "profile.emailInvalid": "Bu, e-poçt ünvanına oxşamır.",
  "profile.emailSame": "Bu, artıq sizin e-poçt ünvanınızdır.",
  "profile.emailPending":
    "{email} ünvanına təsdiq linki göndərdik. Məktubu açıb linkə basın. Ünvanınız yalnız bundan sonra dəyişəcək, ona görə o vaxta qədər {current} ünvanı ilə daxil olmağa davam edin.",
  "profile.emailPendingNote":
    "Təhlükəsizlik üçün cari ünvanınıza da link gələ bilər. Onu da açın.",
  "profile.emailPendingFix": "Səhv yazmısınız? Düzgün ünvanı aşağıda yazıb yenidən göndərin.",
  "profile.emailResend": "Linki yenidən göndər",
  "profile.emailResent": "Linki {email} ünvanına yenidən göndərdik.",
  "profile.emailChanged": "Yeni e-poçt ünvanınız: {email}.",
  "profile.emailGoogleOnly":
    "E-poçt ünvanınız Google hesabınızdan gəlir. Əvvəlcə aşağıda şifrə təyin edin, sonra ünvanı buradan dəyişə bilərsiniz.",

  "profile.passwordEmpty": "Şifrə daxil edin.",
  "profile.passwordTooShort": "Ən azı 8 simvol istifadə edin.",
  "profile.passwordNeedsMix": "Ən azı bir hərf və bir rəqəm daxil edin.",
  "profile.showPassword": "Göstər",
  "profile.hidePassword": "Gizlət",
  "profile.showPasswordAria": "Şifrəni göstər",
  "profile.hidePasswordAria": "Şifrəni gizlət",

  "profile.errEmailTaken": "Bu e-poçt ünvanı artıq başqa hesabda istifadə olunur.",
  "profile.errEmailInvalid": "Bu, düzgün e-poçt ünvanına oxşamır.",
  "profile.errEmailNotAllowed": "Bu ünvana hələlik məktub göndərmək olmur. Başqa ünvan sınayın.",
  "profile.errSamePassword": "Bu, artıq sizin şifrənizdir. Başqasını seçin.",
  "profile.errWeakPassword": "Bu şifrə çox zəifdir. Ən azı 8 simvol, bir hərf və bir rəqəm istifadə edin.",
  "profile.errReauth": "Təhlükəsizlik üçün hesabdan çıxıb yenidən daxil olun, sonra bir daha cəhd edin.",
  "profile.errRateLimit": "Çox cəhd edildi. Bir dəqiqə gözləyib yenidən cəhd edin.",
  "profile.errSignInAgain": "Girişiniz başa çatıb. Davam etmək üçün yenidən daxil olun.",
  "profile.errNetwork": "Serverə qoşulmaq mümkün olmadı. İnternet bağlantınızı yoxlayıb yenidən cəhd edin.",
  "profile.errGoogleTaken": "Bu Google hesabı artıq başqa Exampeak hesabına qoşulub.",
  "profile.errLinkingOff": "Google-u mövcud hesaba qoşmaq hələ aktiv deyil.",
  "profile.errOnlyWay": "Google bu hesaba girişin yeganə yoludur, ona görə ayırmaq olmaz.",
  "profile.errGoogleOff": "Google ilə giriş hələ aktiv deyil.",
  "profile.errLinkCancelled": "Google-un qoşulması ləğv edildi, heç nə dəyişmədi.",
  "profile.errLinkExpired": "Linkin müddəti bitib və ya o artıq istifadə olunub.",
  "profile.errNotConfigured": "Supabase qoşulmadığı üçün hesablar hələ aktiv deyil.",
  "profile.errPhotoSize": "Bu şəkil çox böyükdür. O, 2 MB-dan böyük olmamalıdır.",
  "profile.errPhotoType": "Yalnız JPG, PNG və ya WebP şəkillərindən istifadə etmək olar.",
  "profile.errPhotoEmpty": "Bu şəkil boşdur.",
  "profile.errPhotoMissing": "Yükləmək üçün şəkil seçin.",
  "profile.errGeneric": "Nəsə alınmadı. Bir azdan yenidən cəhd edin.",

  "profile.username": "İstifadəçi adı",
  "profile.usernameRules":
    "3-dən 20-yə qədər simvol: a-z hərfləri, rəqəmlər, _ və nöqtə. Hərflə başlamalıdır. Dostlarınız sizi bu adla tapır.",
  "profile.usernameEmpty": "İstifadəçi adı daxil edin.",
  "profile.usernameTooShort": "Ən azı 3 simvol işlədin.",
  "profile.usernameTooLong": "Ən çoxu 20 simvol işlədin.",
  "profile.usernameBadChars": "Yalnız a-z hərfləri, rəqəmlər, _ və nöqtə işlətmək olar.",
  "profile.usernameBadStart": "Ad hərflə başlamalıdır.",
  "profile.usernameReserved": "Bu ad qorunur. Başqasını seçin.",
  "profile.usernameTaken": "Bu istifadəçi adı artıq tutulub.",
  "profile.usernameInvalid": "Bu istifadəçi adından istifadə etmək olmaz. 3–20 simvol: hərflər, rəqəmlər, _ və ya nöqtə.",
  "profile.usernameAvailable": "@{username} boşdur.",
  "profile.usernameChecking": "Yoxlanılır...",
  "profile.usernameYours": "Bu, sizin hazırkı istifadəçi adınızdır.",
  "profile.usernameCheckFailed": "Adın boş olub-olmadığını yoxlamaq mümkün olmadı. Yenə də yadda saxlaya bilərsiniz.",
  "profile.usernameSaved": "İstifadəçi adı yeniləndi.",
  "profile.detailsSaved": "Məlumatlar yeniləndi.",
  "profile.saveDetails": "Dəyişiklikləri yadda saxla",

  "common.saving": "Yadda saxlanılır...",
  "common.back": "Geri",

  // Page not found
  "notFound.title": "Səhifə tapılmadı",
  "notFound.body":
    "Bu ünvanda heç nə yoxdur. Linkdə hərf səhvi ola bilər, ya da səhifə başqa yerə köçüb.",
  "notFound.home": "Ana səhifəyə qayıt",
  "notFound.dashboard": "Ana səhifəyə qayıt",

  // Page titles
  "title.home": "9-cu sinif üçün sınaq testləri",
  "title.dashboard": "Ana səhifə",
  "title.signIn": "Daxil ol",
  "title.register": "Hesab yarat",
  "title.build": "Yeni sınaq testi",
  "title.exam": "Test gedir",
  "title.results": "Nəticələr",
  "title.history": "Test tarixçəsi",
  "title.friends": "Dostlar",
  "title.profile": "Profiliniz",
  "title.settings": "Tənzimləmələr",
  "title.admin": "Admin paneli",
  "title.notFound": "Səhifə tapılmadı"
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

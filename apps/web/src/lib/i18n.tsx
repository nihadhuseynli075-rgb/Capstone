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
    "Build a mock test from past-paper questions, sit it start to finish, and see your score and every mistake, with the right answer, at the end.",
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
  // Removing a friendship that has already ended: it was never a request.
  "friends.error.friendGone": "That friendship has already ended. The list has been refreshed.",

  "friends.incomingTitle": "Requests for you",
  "friends.outgoingTitle": "Waiting for an answer",
  "friends.accept": "Accept",
  "friends.decline": "Decline",
  "friends.cancel": "Cancel request",
  // What a screen reader calls each button: the visible word, then whose it
  // is, so a list of a dozen "Remove" buttons can be told apart.
  "friends.acceptAria": "Accept request from {name}",
  "friends.declineAria": "Decline request from {name}",
  "friends.cancelAria": "Cancel request to {name}",
  "friends.removeAria": "Remove {name}",

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

  // Sign-in and sign-up
  "app.loading": "Loading Exampeak...",
  "auth.loginTitle": "Welcome back",
  "auth.loginSubtitle": "Sign in to pick up your history and your best result.",
  "auth.newHere": "New here?",
  "auth.createAccountLink": "Create an account",
  "auth.guestTest": "Take a test as a guest",
  "auth.orEmailSignIn": "or sign in with your email",
  "auth.passwordPlaceholder": "Your password",
  "auth.enterPassword": "Enter your password.",
  "auth.signingIn": "Signing in...",
  "auth.checkEmailTitle": "Check your email",
  "auth.checkEmailBody": "We sent a confirmation link to {email}. Open it to finish setting up your account.",
  "auth.alreadyConfirmed": "Already confirmed?",
  "auth.checkEmailNote":
    "Nothing else to do here. The link expires after 24 hours, so if it has been longer than that, sign up again with the same email.",
  "auth.registerTitle": "Create your account",
  "auth.registerSubtitle": "Your tests, your history and your best result, saved and on any device.",
  "auth.haveAccount": "Already have an account?",
  "auth.orEmailSignUp": "or sign up with your email",
  "auth.namePlaceholder": "Your name",
  "auth.newPasswordPlaceholder": "At least 8 characters",
  "auth.creatingAccount": "Creating account...",
  "auth.createAccount": "Create account",
  "auth.strengthWeak": "Weak",
  "auth.strengthFair": "Fair",
  "auth.strengthStrong": "Strong",
  "auth.continueGoogle": "Continue with Google",
  "auth.asideTitle": "Practise the real exam, then find out exactly what to fix.",
  "auth.asidePoint1": "Mock tests built from real past-paper questions",
  "auth.asidePoint2": "Marked instantly, with the right answer to every mistake",
  "auth.asidePoint3": "Your history and best result, saved to your account",
  "auth.errWrongPassword": "That email and password do not match. Check them and try again.",
  "auth.errNotConfirmed": "Confirm your email address first. Check your inbox for the link we sent.",
  "auth.errAccountExists": "There is already an account with that email. Try signing in instead.",
  "auth.errUnavailable": "Could not reach the server. Try again in a moment.",
  "auth.errSetupFailed": "Your account could not be set up just now. Try again in a moment.",
  "auth.errGoogleCancelled": "Signing in with Google was cancelled. Try again, or use your email and password.",
  "auth.errSignInLinkExpired":
    "That link has expired or has already been used. Sign in, or sign up again to be sent a new one.",
  "auth.errNotFinished": "Signing in did not finish. Try again.",

  // Privacy and terms
  "legal.privacy": "Privacy",
  "legal.terms": "Terms of use",
  "legal.signUpNotice": "By creating an account you accept the {terms}. The {privacy} says what we keep and how to delete it.",
  "legal.termsInline": "terms of use",
  "legal.privacyInline": "privacy page",

  // Forgotten password
  "auth.forgotPassword": "Forgot password?",
  "auth.resetTitle": "Reset your password",
  "auth.resetSubtitle": "Enter the email you signed up with, and we will send you a link to choose a new password.",
  "auth.resetSend": "Send the link",
  "auth.resetSending": "Sending...",
  "auth.resetSent":
    "If that email has an account, a link is on its way. Open it in this browser to choose a new password. It may take a minute, so check your spam folder too.",
  "auth.rememberedIt": "Remembered it?",
  "auth.newPasswordTitle": "Choose a new password",
  "auth.newPasswordSubtitle": "This is the password you will sign in with from now on.",
  "auth.newPasswordSaved": "Your password has been changed, and you are signed in.",
  "auth.goToDashboard": "Go to your dashboard",

  // A test in progress
  "exam.leaveConfirm":
    "Leave this test? Your answers are kept, and you can come back to it from the dashboard or the test builder.",
  "exam.leaveConfirmTimed":
    "Leave this test? Your answers are kept, and you can come back to it from the dashboard or the test builder. The timer keeps running while you are away.",
  "exam.leaveConfirmGuest":
    "Leave this test? Your answers are kept, and you can come back to it from the test builder.",
  "exam.leaveConfirmGuestTimed":
    "Leave this test? Your answers are kept, and you can come back to it from the test builder. The timer keeps running while you are away.",
  "exam.resumeTitle": "You have a test in progress",
  "exam.resumeBody": "{title}: {answered} of {total} questions answered. Starting a new test replaces it.",
  "exam.resume": "Resume test",

  // Test builder: what each difficulty can draw
  "builder.presetReady": "{available} of {asked} ready",
  "builder.customReady": "Questions in these topics: {available}",
  "builder.noneEasy": "No easy questions in these topics yet",
  "builder.noneMedium": "No medium questions in these topics yet",
  "builder.noneHard": "No hard questions in these topics yet",
  // Test flow: the builder, the exam, the results and the history.
  // A string with "|" in it is one form per plural category, chosen by tn():
  // English has two (one, other), Russian three (one, few, many), and
  // Azerbaijani one, since a noun after a number stays singular there.
  "count.questions": "{n} question|{n} questions",
  "count.minutes": "{n} minute|{n} minutes",
  "count.topics": "{n} topic|{n} topics",
  "count.marks": "{n} mark|{n} marks",
  "count.words": "{n} word|{n} words",
  "count.mistakes": "{n} mistake|{n} mistakes",

  "difficulty.easy": "Easy",
  "difficulty.medium": "Medium",
  "difficulty.hard": "Hard",
  "difficulty.custom": "Custom",

  "topic.algebra": "Algebra",
  "topic.geometry": "Geometry",
  "topic.functions": "Functions and Graphs",
  "topic.probability": "Probability and Statistics",
  "topic.arithmetic": "Arithmetic",
  "topic.coordinate-geometry": "Coordinate Geometry",
  "topic.number-theory": "Number Theory",
  "topic.sets-logic": "Sets and Logic",
  "topic.grammar": "Grammar",
  "topic.vocabulary": "Vocabulary",
  "topic.reading": "Reading Comprehension",
  "topic.writing": "Writing",
  "topic.spelling": "Spelling",
  "topic.punctuation": "Punctuation",
  "topic.phonetics": "Phonetics",

  "test.errInvalid": "Those test settings were not accepted. Refresh the page and try again.",
  "test.errNotFound": "That test could not be found.",
  "test.errTooMany": "Too many tests were started from this connection. Wait a few minutes, then try again.",
  "test.errNotYours": "That test belongs to a different account.",
  "test.errNotSubmitted": "That test has not been handed in yet.",
  "test.errTimeExpired":
    "The time limit for this test ran out, so it can no longer be handed in. Start a new test to try again.",
  "test.errNoQuestions": "There are no questions in the bank for that subject, topic and difficulty yet.",

  "builder.title": "Create a mock test",
  "builder.loading": "Loading subjects...",
  "builder.lede":
    "Pick what you want to practise. Your score and your mistakes, with the right answers, are shown at the end, the same way a real exam works.",
  "builder.bankEmpty": "There are no questions in the bank yet. Add some from the {link} first.",
  "builder.bankEmptyLink": "admin dashboard",
  "builder.subject": "Subject",
  "builder.topics": "Topics",
  "builder.noQuestions": "no questions yet",
  // A topic card counts what the difficulty chosen below can draw on.
  "builder.topicCountAt": "{questions} ({difficulty})",
  "builder.topicNoneAt": "no questions on {difficulty}",
  "builder.lastScore": "Last score {n}%",
  "builder.notTried": "Not tried yet",
  "builder.difficulty": "Difficulty",
  "builder.difficultyHint":
    "Easy, medium and hard set the number of questions and the timer for you. Choose custom to set them yourself.",
  "builder.presetDetail": "{questions} in {minutes}",
  "builder.customDetail": "Choose the length and timer yourself",
  "builder.countLabel": "Number of questions",
  "builder.minutesLabel": "Time limit (minutes)",
  "builder.countRange": "Between {min} and {max}",
  "builder.minutesRange": "Between {min} and {max} minutes",
  "builder.untimed": "No timer - take as long as I need",
  "builder.ready": "{n} question ready|{n} questions ready",
  "builder.short": "- you asked for {requested}, but the bank only has {available} for this selection",
  "builder.noTopic": "Choose at least one topic.",
  "builder.building": "Building your test...",
  "builder.start": "Start mock test",

  "exam.loading": "Loading your test...",
  // One line that is cut short on a phone, so every language puts the subject
  // and topic first and the words "mock test" last.
  "exam.title": "{subject} - {topic} mock test",
  "exam.progress": "Question {current} of {total} - {answered} answered",
  "exam.untimed": "No time limit",
  "exam.remaining": "remaining",
  "exam.short":
    "The question bank only had {questions} that matched, so this test is shorter than the {requested} you asked for.",
  "exam.palette": "Jump to question",
  "exam.dotAnswered": "Question {n}, answered",
  "exam.dotUnanswered": "Question {n}, not answered",
  "exam.diagram": "Question diagram",
  "exam.yourAnswer": "Your answer",
  "exam.writtenPlaceholder": "Write your answer here. A teacher-style marker will read it when you submit.",
  "exam.shortPlaceholder": "Type your answer",
  "exam.timeUpFailed": "Time ran out, but the test could not be sent. {reason}",
  "exam.newTest": "Start a new test",
  "exam.sending": "Sending...",
  "exam.retry": "Try sending again",
  "exam.previous": "Previous",
  "exam.next": "Next",
  "exam.marking": "Marking...",
  "exam.finish": "Finish and see results",
  "exam.confirmUnanswered":
    "{n} question is still unanswered. Submit anyway?|{n} questions are still unanswered. Submit anyway?",

  "results.title": "Results",
  "results.backToHistory": "Back to history",
  "results.loading": "Loading your results...",
  "results.marksUnit": "marks",
  "results.completeSubject": "{subject} test complete",
  "results.complete": "Test complete",
  "results.summary": "{questions} in {time} - {mistakes} to review.",
  "results.durationMinutes": "{m}m {s}s",
  "results.durationSeconds": "{s}s",
  "results.newBest": "New personal best. Your previous best was {score}.",
  "results.firstTest": "First test recorded. Everything from here is measured against this one.",
  "results.bestSoFar": "Your best so far: {score} ({difficulty}).",
  // Level with the best: not a new best, which a tie used to be called.
  "results.matchedBest": "You matched your best so far: {score} ({difficulty}).",
  "results.byTopic": "How you did by topic",
  "results.everyQuestion": "Every question",
  "results.onlyMistakes": "Show only my mistakes",
  "results.questionNumber": "Q{n}",
  "results.notCounted": "Not counted",
  "results.marksOf": "{score}/{n} mark|{score}/{n} marks",
  "results.notMarked": "Not marked",
  "results.fullMarks": "Full marks",
  "results.correct": "Correct",
  "results.partly": "Partly right",
  "results.wrong": "Wrong",
  "results.leftBlank": "Left blank",
  "results.markerLookedFor": "What the marker looked for",
  "results.correctAnswer": "Correct answer",
  "results.feedback": "Teacher's feedback:",
  "results.unmarkedNote":
    "This answer could not be marked just now, so it is not counted in your score either way.",
  "results.why": "Why:",
  "results.noMistakes": "No mistakes on this one. Nothing to review.",
  "results.another": "Take another test",

  "history.loading": "Loading your history...",
  "history.empty": "You have not finished a test yet.",
  "history.first": "Create your first mock test",
  "history.lede":
    "Your best result is highlighted. It accounts for difficulty and test length, not just the percentage.",
  "history.best": "Best test so far",
  "history.all": "All attempts",

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
  "title.description": "Exampeak generates Grade 9 mock tests from past-paper questions, marks them, and shows the right answer to every mistake.",
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
  "title.notFound": "Page not found",
  "title.privacy": "Privacy",
  "title.terms": "Terms of use",
  "title.resetPassword": "Reset your password"
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
    "Составьте пробный тест из заданий прошлых лет, пройдите его целиком и в конце увидите свой балл и все ошибки с правильными ответами.",
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
  "friends.error.friendGone": "Вы уже не друзья с этим человеком. Список обновлён.",

  "friends.incomingTitle": "Запросы к вам",
  "friends.outgoingTitle": "Ждут ответа",
  "friends.accept": "Принять",
  "friends.decline": "Отклонить",
  "friends.cancel": "Отменить запрос",
  "friends.acceptAria": "Принять запрос: {name}",
  "friends.declineAria": "Отклонить запрос: {name}",
  "friends.cancelAria": "Отменить запрос: {name}",
  "friends.removeAria": "Удалить из друзей: {name}",

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

  // Sign-in and sign-up
  "app.loading": "Загружаем Exampeak...",
  "auth.loginTitle": "С возвращением",
  "auth.loginSubtitle": "Войдите, чтобы вернуться к своей истории и лучшему результату.",
  "auth.newHere": "Впервые здесь?",
  "auth.createAccountLink": "Создать аккаунт",
  "auth.guestTest": "Пройти тест как гость",
  "auth.orEmailSignIn": "или войдите по электронной почте",
  "auth.passwordPlaceholder": "Ваш пароль",
  "auth.enterPassword": "Введите пароль.",
  "auth.signingIn": "Входим...",
  "auth.checkEmailTitle": "Проверьте почту",
  "auth.checkEmailBody": "Мы отправили ссылку для подтверждения на {email}. Откройте её, чтобы завершить создание аккаунта.",
  "auth.alreadyConfirmed": "Уже подтвердили?",
  "auth.checkEmailNote":
    "Больше здесь ничего делать не нужно. Ссылка действует 24 часа: если прошло больше, зарегистрируйтесь снова с той же почтой.",
  "auth.registerTitle": "Создайте аккаунт",
  "auth.registerSubtitle": "Ваши тесты, история и лучший результат сохраняются и доступны на любом устройстве.",
  "auth.haveAccount": "Уже есть аккаунт?",
  "auth.orEmailSignUp": "или зарегистрируйтесь по электронной почте",
  "auth.namePlaceholder": "Ваше имя",
  "auth.newPasswordPlaceholder": "Не меньше 8 символов",
  "auth.creatingAccount": "Создаём аккаунт...",
  "auth.createAccount": "Создать аккаунт",
  "auth.strengthWeak": "Слабый",
  "auth.strengthFair": "Средний",
  "auth.strengthStrong": "Надёжный",
  "auth.continueGoogle": "Продолжить с Google",
  "auth.asideTitle": "Тренируйтесь в формате настоящего экзамена и узнайте, что именно нужно подтянуть.",
  "auth.asidePoint1": "Пробные тесты из настоящих заданий прошлых лет",
  "auth.asidePoint2": "Мгновенная проверка и правильный ответ к каждой ошибке",
  "auth.asidePoint3": "История и лучший результат сохраняются в вашем аккаунте",
  "auth.errWrongPassword": "Почта и пароль не совпадают. Проверьте их и попробуйте снова.",
  "auth.errNotConfirmed": "Сначала подтвердите адрес электронной почты: ссылка в письме, которое мы отправили.",
  "auth.errAccountExists": "Аккаунт с этой почтой уже есть. Попробуйте войти.",
  "auth.errUnavailable": "Не удалось связаться с сервером. Попробуйте ещё раз чуть позже.",
  "auth.errSetupFailed": "Сейчас не удалось создать аккаунт. Попробуйте ещё раз чуть позже.",
  "auth.errGoogleCancelled": "Вход через Google отменён. Попробуйте снова или войдите по почте и паролю.",
  "auth.errSignInLinkExpired":
    "Срок действия ссылки истёк, или она уже использована. Войдите или зарегистрируйтесь снова, чтобы получить новую.",
  "auth.errNotFinished": "Вход не завершился. Попробуйте снова.",

  // Privacy and terms
  "legal.privacy": "Конфиденциальность",
  "legal.terms": "Условия использования",
  "legal.signUpNotice":
    "Создавая аккаунт, вы принимаете {terms}. На странице {privacy} написано, что мы храним и как это удалить.",
  "legal.termsInline": "условия использования",
  "legal.privacyInline": "о конфиденциальности",

  // Forgotten password
  "auth.forgotPassword": "Забыли пароль?",
  "auth.resetTitle": "Сброс пароля",
  "auth.resetSubtitle": "Введите почту, с которой вы регистрировались, и мы пришлём ссылку, чтобы задать новый пароль.",
  "auth.resetSend": "Отправить ссылку",
  "auth.resetSending": "Отправляем...",
  "auth.resetSent":
    "Если с этой почтой есть аккаунт, ссылка уже в пути. Откройте её в этом браузере, чтобы задать новый пароль. Письмо может прийти не сразу, проверьте и папку «Спам».",
  "auth.rememberedIt": "Вспомнили пароль?",
  "auth.newPasswordTitle": "Задайте новый пароль",
  "auth.newPasswordSubtitle": "С этим паролем вы будете входить с этого момента.",
  "auth.newPasswordSaved": "Пароль изменён, и вы вошли в аккаунт.",
  "auth.goToDashboard": "Перейти на главную",

  // A test in progress
  "exam.leaveConfirm":
    "Выйти из теста? Ваши ответы сохранятся, и вы сможете вернуться к нему с главной страницы или со страницы создания теста.",
  "exam.leaveConfirmTimed":
    "Выйти из теста? Ваши ответы сохранятся, и вы сможете вернуться к нему с главной страницы или со страницы создания теста. Таймер продолжает идти, пока вас нет.",
  "exam.leaveConfirmGuest":
    "Выйти из теста? Ваши ответы сохранятся, и вы сможете вернуться к нему со страницы создания теста.",
  "exam.leaveConfirmGuestTimed":
    "Выйти из теста? Ваши ответы сохранятся, и вы сможете вернуться к нему со страницы создания теста. Таймер продолжает идти, пока вас нет.",
  "exam.resumeTitle": "У вас есть незаконченный тест",
  "exam.resumeBody": "{title}: отвечено {answered} из {total} вопросов. Если начать новый тест, этот будет заменён.",
  "exam.resume": "Продолжить тест",

  // Test builder: what each difficulty can draw
  "builder.presetReady": "Готово: {available} из {asked}",
  "builder.customReady": "Вопросов в этих темах: {available}",
  "builder.noneEasy": "В этих темах пока нет лёгких вопросов",
  "builder.noneMedium": "В этих темах пока нет вопросов средней сложности",
  "builder.noneHard": "В этих темах пока нет сложных вопросов",
  // Test flow
  "count.questions": "{n} вопрос|{n} вопроса|{n} вопросов",
  "count.minutes": "{n} минута|{n} минуты|{n} минут",
  "count.topics": "{n} тема|{n} темы|{n} тем",
  "count.marks": "{n} балл|{n} балла|{n} баллов",
  "count.words": "{n} слово|{n} слова|{n} слов",
  "count.mistakes": "{n} ошибка|{n} ошибки|{n} ошибок",

  "difficulty.easy": "Лёгкий",
  "difficulty.medium": "Средний",
  "difficulty.hard": "Сложный",
  "difficulty.custom": "Свой",

  "topic.algebra": "Алгебра",
  "topic.geometry": "Геометрия",
  "topic.functions": "Функции и графики",
  "topic.probability": "Вероятность и статистика",
  "topic.arithmetic": "Арифметика",
  "topic.coordinate-geometry": "Координатная геометрия",
  "topic.number-theory": "Теория чисел",
  "topic.sets-logic": "Множества и логика",
  "topic.grammar": "Грамматика",
  "topic.vocabulary": "Лексика",
  "topic.reading": "Работа с текстом",
  "topic.writing": "Письменная речь",
  "topic.spelling": "Орфография",
  "topic.punctuation": "Пунктуация",
  "topic.phonetics": "Фонетика",

  "test.errInvalid": "Эти настройки теста не приняты. Обновите страницу и попробуйте снова.",
  "test.errNotFound": "Этот тест не найден.",
  "test.errTooMany": "С этого подключения начато слишком много тестов. Подождите несколько минут и попробуйте снова.",
  "test.errNotYours": "Этот тест принадлежит другому аккаунту.",
  "test.errNotSubmitted": "Этот тест ещё не сдан.",
  "test.errTimeExpired":
    "Время на этот тест истекло, поэтому сдать его уже нельзя. Начните новый тест, чтобы попробовать снова.",
  "test.errNoQuestions": "В банке пока нет вопросов по этому предмету, теме и уровню сложности.",

  "builder.title": "Создать пробный тест",
  "builder.loading": "Загружаем предметы...",
  "builder.lede":
    "Выберите, что хотите потренировать. Балл и ошибки с правильными ответами вы увидите в конце, как на настоящем экзамене.",
  "builder.bankEmpty": "В банке пока нет вопросов. Сначала добавьте их в {link}.",
  "builder.bankEmptyLink": "панели администратора",
  "builder.subject": "Предмет",
  "builder.topics": "Темы",
  "builder.noQuestions": "вопросов пока нет",
  "builder.topicCountAt": "{questions} ({difficulty})",
  "builder.topicNoneAt": "нет вопросов уровня «{difficulty}»",
  "builder.lastScore": "Последний результат: {n}%",
  "builder.notTried": "Ещё не проходили",
  "builder.difficulty": "Сложность",
  "builder.difficultyHint":
    "Лёгкий, средний и сложный уровни сами задают количество вопросов и таймер. Выберите «Свой», чтобы задать их самостоятельно.",
  "builder.presetDetail": "{questions}, {minutes}",
  "builder.customDetail": "Длину теста и таймер выбираете вы",
  "builder.countLabel": "Количество вопросов",
  "builder.minutesLabel": "Время на тест (минуты)",
  "builder.countRange": "От {min} до {max}",
  "builder.minutesRange": "От {min} до {max} минут",
  "builder.untimed": "Без таймера — решать столько, сколько нужно",
  "builder.ready": "{n} вопрос готов|{n} вопроса готовы|{n} вопросов готово",
  "builder.short": "— вы просили {requested}, но для такого выбора в банке есть только {available}",
  "builder.noTopic": "Выберите хотя бы одну тему.",
  "builder.building": "Составляем тест...",
  "builder.start": "Начать пробный тест",

  "exam.loading": "Загружаем тест...",
  "exam.title": "{subject}, {topic} — пробный тест",
  "exam.progress": "Вопрос {current} из {total}, отвечено: {answered}",
  "exam.untimed": "Без ограничения времени",
  "exam.remaining": "осталось",
  "exam.short":
    "В банке нашлось только {questions} под ваш выбор, поэтому тест короче, чем вы просили ({requested}).",
  "exam.palette": "Перейти к вопросу",
  "exam.dotAnswered": "Вопрос {n}, есть ответ",
  "exam.dotUnanswered": "Вопрос {n}, нет ответа",
  "exam.diagram": "Рисунок к вопросу",
  "exam.yourAnswer": "Ваш ответ",
  "exam.writtenPlaceholder":
    "Напишите ответ здесь. После отправки его прочитает и оценит проверяющий, как это сделал бы учитель.",
  "exam.shortPlaceholder": "Введите ответ",
  "exam.timeUpFailed": "Время вышло, но тест не удалось отправить. {reason}",
  "exam.newTest": "Начать новый тест",
  "exam.sending": "Отправляем...",
  "exam.retry": "Отправить ещё раз",
  "exam.previous": "Назад",
  "exam.next": "Далее",
  "exam.marking": "Проверяем...",
  "exam.finish": "Завершить и узнать результат",
  "exam.confirmUnanswered":
    "Без ответа остался {n} вопрос. Всё равно отправить?|Без ответа осталось {n} вопроса. Всё равно отправить?|Без ответа осталось {n} вопросов. Всё равно отправить?",

  "results.title": "Результаты",
  "results.backToHistory": "К истории тестов",
  "results.loading": "Загружаем результаты...",
  "results.marksUnit": "баллы",
  "results.completeSubject": "{subject}: тест завершён",
  "results.complete": "Тест завершён",
  "results.summary": "{questions} за {time}. На разбор: {mistakes}.",
  "results.durationMinutes": "{m} мин {s} с",
  "results.durationSeconds": "{s} с",
  "results.newBest": "Новый личный рекорд! Ваш прошлый лучший результат: {score}.",
  "results.firstTest": "Первый тест записан. Все следующие будут сравниваться с ним.",
  "results.bestSoFar": "Ваш лучший результат пока: {score} ({difficulty}).",
  "results.matchedBest": "Вы повторили свой лучший результат: {score} ({difficulty}).",
  "results.byTopic": "Результаты по темам",
  "results.everyQuestion": "Все вопросы",
  "results.onlyMistakes": "Показывать только ошибки",
  "results.questionNumber": "Вопрос {n}",
  "results.notCounted": "Не учитывается",
  "results.marksOf": "Баллы: {score}/{n}",
  "results.notMarked": "Не проверен",
  "results.fullMarks": "Полный балл",
  "results.correct": "Верно",
  "results.partly": "Частично верно",
  "results.wrong": "Неверно",
  "results.leftBlank": "Нет ответа",
  "results.markerLookedFor": "Что ожидал проверяющий",
  "results.correctAnswer": "Верный ответ",
  "results.feedback": "Отзыв учителя:",
  "results.unmarkedNote":
    "Этот ответ сейчас не удалось проверить, поэтому он никак не влияет на ваш результат.",
  "results.why": "Почему:",
  "results.noMistakes": "В этом тесте нет ошибок. Разбирать нечего.",
  "results.another": "Пройти ещё один тест",

  "history.loading": "Загружаем историю...",
  "history.empty": "Вы ещё не завершили ни одного теста.",
  "history.first": "Создать первый пробный тест",
  "history.lede":
    "Лучший результат выделен. Он учитывает сложность и длину теста, а не только процент.",
  "history.best": "Лучший тест",
  "history.all": "Все попытки",

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
  "title.description": "Exampeak составляет пробные тесты для 9 класса из вопросов прошлых лет, проверяет их и показывает верный ответ на каждую ошибку.",
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
  "title.notFound": "Страница не найдена",
  "title.privacy": "Конфиденциальность",
  "title.terms": "Условия использования",
  "title.resetPassword": "Сброс пароля"
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
    "Keçmiş illərin suallarından sınaq testi qurun, əvvəldən sona qədər həll edin və sonda balınızı və bütün səhvlərinizi düzgün cavabları ilə görün.",
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
  "friends.error.friendGone": "Bu dostluq artıq bitib. Siyahı yeniləndi.",

  "friends.incomingTitle": "Sizə gələn sorğular",
  "friends.outgoingTitle": "Cavab gözləyənlər",
  "friends.accept": "Qəbul et",
  "friends.decline": "Rədd et",
  "friends.cancel": "Sorğunu ləğv et",
  "friends.acceptAria": "Qəbul et: {name}",
  "friends.declineAria": "Rədd et: {name}",
  "friends.cancelAria": "Sorğunu ləğv et: {name}",
  "friends.removeAria": "Sil: {name}",

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

  // Sign-in and sign-up
  "app.loading": "Exampeak yüklənir...",
  "auth.loginTitle": "Yenidən xoş gəldiniz",
  "auth.loginSubtitle": "Tarixçənizə və ən yaxşı nəticənizə qayıtmaq üçün daxil olun.",
  "auth.newHere": "Burada yenisiniz?",
  "auth.createAccountLink": "Hesab yaradın",
  "auth.guestTest": "Qonaq kimi test həll edin",
  "auth.orEmailSignIn": "və ya e-poçtunuzla daxil olun",
  "auth.passwordPlaceholder": "Şifrəniz",
  "auth.enterPassword": "Şifrənizi daxil edin.",
  "auth.signingIn": "Daxil olunur...",
  "auth.checkEmailTitle": "E-poçtunuzu yoxlayın",
  "auth.checkEmailBody": "{email} ünvanına təsdiq linki göndərdik. Hesabınızın yaradılmasını tamamlamaq üçün onu açın.",
  "auth.alreadyConfirmed": "Artıq təsdiq etmisiniz?",
  "auth.checkEmailNote":
    "Burada başqa heç nə etmək lazım deyil. Link 24 saat etibarlıdır: daha çox vaxt keçibsə, eyni e-poçtla yenidən qeydiyyatdan keçin.",
  "auth.registerTitle": "Hesabınızı yaradın",
  "auth.registerSubtitle": "Testləriniz, tarixçəniz və ən yaxşı nəticəniz saxlanılır və istənilən cihazda açılır.",
  "auth.haveAccount": "Artıq hesabınız var?",
  "auth.orEmailSignUp": "və ya e-poçtunuzla qeydiyyatdan keçin",
  "auth.namePlaceholder": "Adınız",
  "auth.newPasswordPlaceholder": "Ən azı 8 simvol",
  "auth.creatingAccount": "Hesab yaradılır...",
  "auth.createAccount": "Hesab yarat",
  "auth.strengthWeak": "Zəif",
  "auth.strengthFair": "Orta",
  "auth.strengthStrong": "Güclü",
  "auth.continueGoogle": "Google ilə davam edin",
  "auth.asideTitle": "Əsl imtahan formatında məşq edin, sonra nəyi düzəltməli olduğunuzu dəqiq öyrənin.",
  "auth.asidePoint1": "Keçmiş illərin real suallarından qurulan sınaq testləri",
  "auth.asidePoint2": "Dərhal yoxlanılır, hər səhvin düzgün cavabı ilə",
  "auth.asidePoint3": "Tarixçəniz və ən yaxşı nəticəniz hesabınızda saxlanılır",
  "auth.errWrongPassword": "E-poçt və şifrə uyğun gəlmir. Yoxlayıb yenidən cəhd edin.",
  "auth.errNotConfirmed": "Əvvəlcə e-poçt ünvanınızı təsdiq edin: link göndərdiyimiz məktubdadır.",
  "auth.errAccountExists": "Bu e-poçtla artıq hesab var. Daxil olmağa cəhd edin.",
  "auth.errUnavailable": "Serverə qoşulmaq mümkün olmadı. Bir az sonra yenidən cəhd edin.",
  "auth.errSetupFailed": "Hesabınızı indi yaratmaq mümkün olmadı. Bir az sonra yenidən cəhd edin.",
  "auth.errGoogleCancelled": "Google ilə giriş ləğv edildi. Yenidən cəhd edin və ya e-poçt və şifrənizlə daxil olun.",
  "auth.errSignInLinkExpired":
    "Linkin müddəti bitib və ya o artıq istifadə olunub. Daxil olun və ya yeni link almaq üçün yenidən qeydiyyatdan keçin.",
  "auth.errNotFinished": "Giriş başa çatmadı. Yenidən cəhd edin.",

  // Privacy and terms
  "legal.privacy": "Məxfilik",
  "legal.terms": "İstifadə şərtləri",
  "legal.signUpNotice":
    "Hesab yaratmaqla {terms} qəbul edirsiniz. Nəyi saxladığımız və onu necə silmək olduğu {privacy} yazılıb.",
  "legal.termsInline": "istifadə şərtlərini",
  "legal.privacyInline": "məxfilik səhifəsində",

  // Forgotten password
  "auth.forgotPassword": "Şifrəni unutmusunuz?",
  "auth.resetTitle": "Şifrəni sıfırlayın",
  "auth.resetSubtitle": "Qeydiyyatdan keçdiyiniz e-poçtu daxil edin, yeni şifrə seçmək üçün sizə link göndərək.",
  "auth.resetSend": "Linki göndər",
  "auth.resetSending": "Göndərilir...",
  "auth.resetSent":
    "Bu e-poçtla hesab varsa, link yoldadır. Yeni şifrə seçmək üçün onu bu brauzerdə açın. Məktub bir az gecikə bilər, «Spam» qovluğunu da yoxlayın.",
  "auth.rememberedIt": "Yadınıza düşdü?",
  "auth.newPasswordTitle": "Yeni şifrə seçin",
  "auth.newPasswordSubtitle": "Bundan sonra bu şifrə ilə daxil olacaqsınız.",
  "auth.newPasswordSaved": "Şifrəniz dəyişdirildi və siz hesabınıza daxil oldunuz.",
  "auth.goToDashboard": "Ana səhifəyə keçin",

  // A test in progress
  "exam.leaveConfirm":
    "Testdən çıxırsınız? Cavablarınız saxlanılır, ona ana səhifədən və ya test yaratma səhifəsindən qayıda bilərsiniz.",
  "exam.leaveConfirmTimed":
    "Testdən çıxırsınız? Cavablarınız saxlanılır, ona ana səhifədən və ya test yaratma səhifəsindən qayıda bilərsiniz. Siz yoxkən taymer işləməyə davam edir.",
  "exam.leaveConfirmGuest":
    "Testdən çıxırsınız? Cavablarınız saxlanılır, ona test yaratma səhifəsindən qayıda bilərsiniz.",
  "exam.leaveConfirmGuestTimed":
    "Testdən çıxırsınız? Cavablarınız saxlanılır, ona test yaratma səhifəsindən qayıda bilərsiniz. Siz yoxkən taymer işləməyə davam edir.",
  "exam.resumeTitle": "Yarımçıq testiniz var",
  "exam.resumeBody": "{title}: {total} sualdan {answered} cavablandırılıb. Yeni test başlasanız, bu test onunla əvəz olunacaq.",
  "exam.resume": "Testə davam et",

  // Test builder: what each difficulty can draw
  "builder.presetReady": "Hazırdır: {asked} sualdan {available}",
  "builder.customReady": "Bu mövzulardakı suallar: {available}",
  "builder.noneEasy": "Bu mövzularda hələ asan sual yoxdur",
  "builder.noneMedium": "Bu mövzularda hələ orta çətinlikdə sual yoxdur",
  "builder.noneHard": "Bu mövzularda hələ çətin sual yoxdur",
  // Test flow
  "count.questions": "{n} sual",
  "count.minutes": "{n} dəqiqə",
  "count.topics": "{n} mövzu",
  "count.marks": "{n} bal",
  "count.words": "{n} söz",
  "count.mistakes": "{n} səhv",

  "difficulty.easy": "Asan",
  "difficulty.medium": "Orta",
  "difficulty.hard": "Çətin",
  "difficulty.custom": "Fərdi",

  "topic.algebra": "Cəbr",
  "topic.geometry": "Həndəsə",
  "topic.functions": "Funksiyalar və qrafiklər",
  "topic.probability": "Ehtimal və statistika",
  "topic.arithmetic": "Hesab",
  "topic.coordinate-geometry": "Koordinat həndəsəsi",
  "topic.number-theory": "Ədədlər nəzəriyyəsi",
  "topic.sets-logic": "Çoxluqlar və məntiq",
  "topic.grammar": "Qrammatika",
  "topic.vocabulary": "Leksika",
  "topic.reading": "Oxu və anlama",
  "topic.writing": "Yazı",
  "topic.spelling": "Orfoqrafiya",
  "topic.punctuation": "Durğu işarələri",
  "topic.phonetics": "Fonetika",

  "test.errInvalid": "Bu test parametrləri qəbul olunmadı. Səhifəni yeniləyib yenidən cəhd edin.",
  "test.errNotFound": "Bu test tapılmadı.",
  "test.errTooMany": "Bu bağlantıdan çox sayda test başladılıb. Bir neçə dəqiqə gözləyin və yenidən cəhd edin.",
  "test.errNotYours": "Bu test başqa hesaba aiddir.",
  "test.errNotSubmitted": "Bu test hələ təhvil verilməyib.",
  "test.errTimeExpired":
    "Bu testin vaxtı bitib, ona görə onu artıq təhvil vermək olmaz. Yenidən cəhd etmək üçün yeni test başladın.",
  "test.errNoQuestions": "Bankda bu fənn, mövzu və çətinlik üzrə hələ sual yoxdur.",

  "builder.title": "Sınaq testi yarat",
  "builder.loading": "Fənlər yüklənir...",
  "builder.lede":
    "Nəyi məşq etmək istədiyinizi seçin. Balınız və səhvləriniz düzgün cavabları ilə, əsl imtahanda olduğu kimi, sonda göstərilir.",
  "builder.bankEmpty": "Bankda hələ sual yoxdur. Əvvəlcə {link} sual əlavə edin.",
  "builder.bankEmptyLink": "admin panelindən",
  "builder.subject": "Fənn",
  "builder.topics": "Mövzular",
  "builder.noQuestions": "hələ sual yoxdur",
  "builder.topicCountAt": "{questions} ({difficulty})",
  "builder.topicNoneAt": "«{difficulty}» səviyyəsində sual yoxdur",
  "builder.lastScore": "Son nəticə: {n}%",
  "builder.notTried": "Hələ cəhd edilməyib",
  "builder.difficulty": "Çətinlik",
  "builder.difficultyHint":
    "Asan, orta və çətin səviyyələr sualların sayını və taymeri sizin yerinizə təyin edir. Bunları özünüz seçmək üçün «Fərdi» seçin.",
  "builder.presetDetail": "{questions}, {minutes}",
  "builder.customDetail": "Uzunluğu və taymeri özünüz seçin",
  "builder.countLabel": "Sualların sayı",
  "builder.minutesLabel": "Vaxt limiti (dəqiqə)",
  "builder.countRange": "Ən azı {min}, ən çoxu {max}",
  "builder.minutesRange": "Ən azı {min}, ən çoxu {max} dəqiqə",
  "builder.untimed": "Taymersiz — nə qədər lazımdırsa, o qədər",
  "builder.ready": "{n} sual hazırdır",
  "builder.short": "— siz {requested} istədiniz, amma bu seçim üçün bankda cəmi {available} sual var",
  "builder.noTopic": "Ən azı bir mövzu seçin.",
  "builder.building": "Test hazırlanır...",
  "builder.start": "Sınaq testinə başla",

  "exam.loading": "Test yüklənir...",
  "exam.title": "{subject}, {topic} — sınaq testi",
  "exam.progress": "Sual {current} / {total}, cavablanıb: {answered}",
  "exam.untimed": "Vaxt məhdudiyyəti yoxdur",
  "exam.remaining": "qalıb",
  "exam.short":
    "Bankda seçiminizə uyğun cəmi {questions} tapıldı, ona görə bu test istədiyiniz {requested} sualdan qısadır.",
  "exam.palette": "Suala keç",
  "exam.dotAnswered": "Sual {n}, cavablanıb",
  "exam.dotUnanswered": "Sual {n}, cavabsız",
  "exam.diagram": "Sualın şəkli",
  "exam.yourAnswer": "Cavabınız",
  "exam.writtenPlaceholder":
    "Cavabınızı bura yazın. Göndərdikdən sonra onu müəllim kimi yoxlayan qiymətləndirici oxuyacaq.",
  "exam.shortPlaceholder": "Cavabınızı yazın",
  "exam.timeUpFailed": "Vaxt bitdi, amma testi göndərmək mümkün olmadı. {reason}",
  "exam.newTest": "Yeni testə başla",
  "exam.sending": "Göndərilir...",
  "exam.retry": "Yenidən göndər",
  "exam.previous": "Əvvəlki",
  "exam.next": "Növbəti",
  "exam.marking": "Yoxlanılır...",
  "exam.finish": "Bitir və nəticəyə bax",
  "exam.confirmUnanswered": "{n} sual hələ cavabsızdır. Yenə də göndərilsin?",

  "results.title": "Nəticələr",
  "results.backToHistory": "Tarixçəyə qayıt",
  "results.loading": "Nəticələriniz yüklənir...",
  "results.marksUnit": "bal",
  "results.completeSubject": "{subject}: test tamamlandı",
  "results.complete": "Test tamamlandı",
  "results.summary": "{questions}, {time}. Təhlil üçün: {mistakes}.",
  "results.durationMinutes": "{m} dəq {s} san",
  "results.durationSeconds": "{s} san",
  "results.newBest": "Yeni şəxsi rekord! Əvvəlki ən yaxşı nəticəniz: {score}.",
  "results.firstTest": "İlk test qeydə alındı. Bundan sonrakılar onunla müqayisə ediləcək.",
  "results.bestSoFar": "İndiyə qədər ən yaxşı nəticəniz: {score} ({difficulty}).",
  "results.matchedBest": "Ən yaxşı nəticənizi təkrarladınız: {score} ({difficulty}).",
  "results.byTopic": "Mövzular üzrə nəticələr",
  "results.everyQuestion": "Bütün suallar",
  "results.onlyMistakes": "Yalnız səhvlərimi göstər",
  "results.questionNumber": "Sual {n}",
  "results.notCounted": "Hesaba alınmır",
  "results.marksOf": "Bal: {score}/{n}",
  "results.notMarked": "Yoxlanılmayıb",
  "results.fullMarks": "Tam bal",
  "results.correct": "Düzgün",
  "results.partly": "Qismən düzgün",
  "results.wrong": "Səhv",
  "results.leftBlank": "Cavab verilməyib",
  "results.markerLookedFor": "Qiymətləndiricinin gözlədiyi",
  "results.correctAnswer": "Düzgün cavab",
  "results.feedback": "Müəllimin rəyi:",
  "results.unmarkedNote":
    "Bu cavabı hələlik yoxlamaq mümkün olmadı, ona görə nəticənizə heç bir təsiri yoxdur.",
  "results.why": "İzah:",
  "results.noMistakes": "Bu testdə səhv yoxdur. Təhlil ediləcək heç nə yoxdur.",
  "results.another": "Başqa test həll et",

  "history.loading": "Tarixçəniz yüklənir...",
  "history.empty": "Hələ heç bir testi bitirməmisiniz.",
  "history.first": "İlk sınaq testinizi yaradın",
  "history.lede":
    "Ən yaxşı nəticəniz fərqləndirilib. O, yalnız faizi deyil, çətinliyi və testin uzunluğunu da nəzərə alır.",
  "history.best": "Ən yaxşı test",
  "history.all": "Bütün cəhdlər",

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
  "title.description": "Exampeak keçmiş illərin suallarından 9-cu sinif üçün sınaq testləri qurur, onları yoxlayır və hər səhvin düzgün cavabını göstərir.",
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
  "title.notFound": "Səhifə tapılmadı",
  "title.privacy": "Məxfilik",
  "title.terms": "İstifadə şərtləri",
  "title.resetPassword": "Şifrəni sıfırlayın"
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

/** Puts values into a sentence's {placeholders}: the dictionaries have no formatting of their own. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    values[name] === undefined ? whole : String(values[name])
  );
}

/**
 * A percentage, given out of 100, in the site language: "26.7%", "26,7 %",
 * "26,7%". It was "26.7%" in every language.
 *
 * Chrome has no Azerbaijani number data either and gives the English form,
 * so that one is built here: a decimal comma, with the sign straight after
 * the number.
 */
export function formatPercent(value: number, language: Language): string {
  if (language === "az") return `${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(value)}%`;
  return new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
}

/**
 * A day and a time in the site language, for a list of past tests: "Oct 4,
 * 02:05 PM", "4 окт., 14:05", "4 oktyabr, 14:05". Azerbaijani is built here
 * for the same reason as in formatDay.
 */
export function formatDayTime(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  if (language === "az") {
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${date.getDate()} ${AZ_MONTHS[date.getMonth()]}, ${time}`;
  }

  return date.toLocaleString(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Which of a string's "|"-separated forms goes with a number.
 *
 * Written out rather than asked of Intl.PluralRules, because the browser's
 * Azerbaijani data is as unreliable as its dates. Russian takes "1 вопрос",
 * "2 вопроса", "5 вопросов", and 11-14 always the last; Azerbaijani has the one
 * form, because a noun after a number does not change there.
 */
function pluralIndex(language: Language, count: number): number {
  const whole = Math.abs(Math.trunc(count));

  if (language === "ru") {
    const lastDigit = whole % 10;
    const lastTwo = whole % 100;
    if (lastDigit === 1 && lastTwo !== 11) return 0;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 1;
    return 2;
  }

  if (language === "en") return whole === 1 ? 0 : 1;
  return 0;
}

/**
 * Whether a key built at run time exists, such as a topic's "topic.<id>".
 *
 * A topic an admin types in has no translation, and is shown by the name the
 * API gives it instead.
 */
export function isTranslationKey(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(en, key);
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
  /**
   * A counted phrase: picks the plural form for `count`, puts it in for {n},
   * and fills any other {placeholders} from `values`.
   */
  tn: (key: TranslationKey, count: number, values?: Record<string, string | number>) => string;
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
  const value = useLanguageValue(language, setLanguage);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * The site's words, or, while `pinned` is set, one language's whatever the
 * site is set to. Choosing a language still changes the site's own.
 *
 * For a page that is in one language only, like the admin dashboard, and the
 * header and footer drawn around it. Pass the result to LanguageScope.
 */
export function usePinnedLanguage(pinned: Language | null): LanguageContextValue {
  const site = useLanguage();
  const fixed = useLanguageValue(pinned ?? site.language, site.setLanguage);
  return pinned === null ? site : fixed;
}

/** Hands everything inside it the words from usePinnedLanguage. */
export function LanguageScope({ value, children }: { value: LanguageContextValue; children: ReactNode }) {
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** The lookups for one language, shared by the site's provider and a pinned one. */
function useLanguageValue(language: Language, setLanguage: (language: Language) => void): LanguageContextValue {
  const t = useCallback((key: TranslationKey) => dictionaries[language][key] ?? en[key], [language]);

  const tn = useCallback(
    (key: TranslationKey, count: number, values: Record<string, string | number> = {}) => {
      const forms = t(key).split("|");
      // A dictionary with fewer forms than the language uses gets its last one
      // rather than nothing.
      const form = forms[Math.min(pluralIndex(language, count), forms.length - 1)];
      const filled: Record<string, string | number> = { ...values, n: count };
      return form.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in filled ? String(filled[name]) : whole
      );
    },
    [language, t]
  );

  return useMemo(() => ({ language, setLanguage, t, tn }), [language, setLanguage, t, tn]);
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside a LanguageProvider.");
  return context;
}

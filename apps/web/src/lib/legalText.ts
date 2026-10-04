import type { Language } from "./i18n";

/**
 * The privacy and terms pages, in plain words, in each site language.
 *
 * Long-form text rather than interface labels, so it lives here as whole
 * documents rather than as dozens of keys in the i18n dictionaries. The shape
 * is the same for every language, and the type below makes a missing language
 * or document a compile error, as the dictionaries do.
 *
 * DRAFT. Herdy and Nihad still have to check every sentence, and there is no
 * contact address yet: "{contact}" is shown as a marked placeholder until one
 * is put here. Anything said about the data must stay true to the code: what
 * is stored (Supabase tables and photo storage), what a friend sees
 * (FriendPerson and FriendProgress in packages/shared), what the AI marker is
 * sent (services/writtenMarking.ts in the API) and what deleting an account
 * removes (deleteAccount in the API's profile repository).
 */

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

interface LegalTexts {
  draftNote: string;
  updated: string;
  /** Shown, marked, wherever "{contact}" appears, until there is an address. */
  contactPlaceholder: string;
  privacy: LegalDocument;
  terms: LegalDocument;
}

export const legalTexts: Record<Language, LegalTexts> = {
  en: {
    draftNote: "Draft - to be checked by Herdy and Nihad.",
    updated: "Last updated: 4 October 2026",
    contactPlaceholder: "[CONTACT EMAIL - to be added]",
    privacy: {
      title: "Privacy",
      intro:
        "Exampeak is a practice site for Grade 9 students. This page says, in plain words, what we keep about you, who can see it, and how to delete it.",
      sections: [
        {
          heading: "What we keep",
          paragraphs: [
            "Without an account: the tests you take, your answers and your scores. They are linked to a random code kept in your browser, not to your name.",
            "With an account: your name, your email address, your username, your profile photo if you add one, and the history of every test you take (the questions, your answers, your scores and the dates).",
            "If you sign in with Google, your name, email address and photo come from your Google account.",
            "All of this is stored in Supabase, the database service the site runs on."
          ]
        },
        {
          heading: "What stays in your browser",
          paragraphs: [
            "Your language, light or dark mode, your sign-in and the test you are in the middle of are kept in your own browser, so the site works when you come back. Clearing your browser's data for this site removes them."
          ]
        },
        {
          heading: "Who can see what",
          paragraphs: [
            "You can see everything about your own account, on your profile and in your test history.",
            "Friends you accept can see your name, username and photo, and your test figures: how many tests you have taken, your best score, your average and when you last took a test. They cannot see your answers or your email address.",
            "When you send someone a friend request, or someone sends you one, they see your name, username and photo.",
            "The people who run Exampeak can see the stored data, to keep the site working."
          ]
        },
        {
          heading: "Written answers and AI marking",
          paragraphs: [
            "Some questions ask you to write an answer in your own words. To mark it, your answer and the question are sent to an AI marking service (Claude, made by Anthropic). Your name and email address are not sent with them."
          ]
        },
        {
          heading: "Deleting it all",
          paragraphs: [
            "Go to Profile and choose Delete account. This permanently deletes your profile, your photo, your friends list and every test you have taken. It cannot be undone.",
            "Tests taken without an account are linked only to the random code in your browser. Clearing your browser's data for this site removes that code."
          ]
        },
        {
          heading: "Questions",
          paragraphs: ["If you have a question about this page, write to us at {contact}."]
        }
      ]
    },
    terms: {
      title: "Terms of use",
      intro: "The rules for using Exampeak. They are short on purpose.",
      sections: [
        {
          heading: "What Exampeak is",
          paragraphs: [
            "A practice site for Grade 9 students getting ready for their final exams. The questions come from past papers.",
            "Scores here are for practice. They do not predict or change your real exam result."
          ]
        },
        {
          heading: "Your account",
          paragraphs: [
            "Keep your password to yourself. If you think someone else has used your account, change your password on your profile.",
            "If you are not sure whether you may make an account, ask a parent or guardian first.",
            "You can delete your account at any time from your profile. The privacy page says what that removes."
          ]
        },
        {
          heading: "Being fair to others",
          paragraphs: [
            "Choose a name, username and photo that would be fine at school.",
            "Do not try to break the site, get into someone else's account, or copy the question bank.",
            "We may remove a name or photo that breaks these rules, or close an account that keeps breaking them."
          ]
        },
        {
          heading: "Mistakes",
          paragraphs: [
            "We check the questions and answers, but some may still be wrong. If you find a mistake, tell us at {contact}.",
            "The site may sometimes be unavailable, for example while it is being updated."
          ]
        },
        {
          heading: "Changes",
          paragraphs: [
            "We may change the site and these rules. When the rules change, the date at the top of this page changes too."
          ]
        }
      ]
    }
  },

  ru: {
    draftNote: "Черновик: текст ещё должны проверить Herdy и Nihad.",
    updated: "Обновлено 4 октября 2026 г.",
    contactPlaceholder: "[АДРЕС ПОЧТЫ ДЛЯ СВЯЗИ — будет добавлен]",
    privacy: {
      title: "Конфиденциальность",
      intro:
        "Exampeak — сайт для подготовки к экзаменам 9 класса. Здесь простыми словами написано, что мы о вас храним, кто это видит и как всё удалить.",
      sections: [
        {
          heading: "Что мы храним",
          paragraphs: [
            "Без аккаунта: пройденные тесты, ваши ответы и баллы. Они привязаны к случайному коду, который хранится в вашем браузере, а не к вашему имени.",
            "С аккаунтом: ваше имя, адрес электронной почты, имя пользователя, фото профиля, если вы его добавите, и история всех тестов (вопросы, ваши ответы, баллы и даты).",
            "Если вы входите через Google, имя, адрес почты и фото берутся из вашего аккаунта Google.",
            "Всё это хранится в Supabase — сервисе баз данных, на котором работает сайт."
          ]
        },
        {
          heading: "Что остаётся в вашем браузере",
          paragraphs: [
            "Язык, светлая или тёмная тема, ваш вход и тест, который вы сейчас проходите, хранятся в вашем браузере, чтобы сайт работал, когда вы вернётесь. Если очистить данные этого сайта в браузере, всё это удалится."
          ]
        },
        {
          heading: "Кто что видит",
          paragraphs: [
            "Всё о своём аккаунте вы видите сами: в профиле и в истории тестов.",
            "Друзья, которых вы приняли, видят ваше имя, имя пользователя и фото, а также показатели по тестам: сколько тестов вы прошли, ваш лучший и средний результат и когда был последний тест. Ваших ответов и адреса почты они не видят.",
            "Когда вы отправляете кому-то запрос в друзья или кто-то отправляет его вам, этот человек видит ваше имя, имя пользователя и фото.",
            "Люди, которые ведут Exampeak, могут видеть сохранённые данные, чтобы сайт работал."
          ]
        },
        {
          heading: "Письменные ответы и проверка с помощью ИИ",
          paragraphs: [
            "В некоторых заданиях нужно написать ответ своими словами. Чтобы его проверить, ваш ответ и само задание отправляются в сервис проверки на основе ИИ (Claude от компании Anthropic). Ваше имя и адрес почты вместе с ними не отправляются."
          ]
        },
        {
          heading: "Как всё удалить",
          paragraphs: [
            "Откройте профиль и выберите «Удалить аккаунт». Это навсегда удалит ваш профиль, фото, список друзей и все пройденные тесты. Отменить это нельзя.",
            "Тесты, пройденные без аккаунта, связаны только со случайным кодом в вашем браузере. Если очистить данные этого сайта в браузере, этот код удалится."
          ]
        },
        {
          heading: "Вопросы",
          paragraphs: ["Если у вас есть вопрос об этой странице, напишите нам: {contact}."]
        }
      ]
    },
    terms: {
      title: "Условия использования",
      intro: "Правила пользования Exampeak. Они нарочно короткие.",
      sections: [
        {
          heading: "Что такое Exampeak",
          paragraphs: [
            "Сайт для девятиклассников, которые готовятся к выпускным экзаменам. Задания взяты из экзаменов прошлых лет.",
            "Баллы здесь тренировочные. Они не предсказывают и не меняют ваш настоящий результат на экзамене."
          ]
        },
        {
          heading: "Ваш аккаунт",
          paragraphs: [
            "Никому не сообщайте свой пароль. Если вам кажется, что кто-то другой заходил в ваш аккаунт, смените пароль в профиле.",
            "Если вы не уверены, можно ли вам создать аккаунт, сначала спросите родителей или опекуна.",
            "Вы можете удалить аккаунт в любой момент в своём профиле. Что при этом удаляется, написано на странице о конфиденциальности."
          ]
        },
        {
          heading: "Уважайте других",
          paragraphs: [
            "Выбирайте имя, имя пользователя и фото, которые были бы уместны в школе.",
            "Не пытайтесь сломать сайт, войти в чужой аккаунт или скопировать банк заданий.",
            "Мы можем убрать имя или фото, которые нарушают эти правила, или закрыть аккаунт, который нарушает их снова и снова."
          ]
        },
        {
          heading: "Ошибки",
          paragraphs: [
            "Мы проверяем задания и ответы, но ошибки всё же возможны. Если вы нашли ошибку, напишите нам: {contact}.",
            "Иногда сайт может быть недоступен, например во время обновления."
          ]
        },
        {
          heading: "Изменения",
          paragraphs: [
            "Мы можем менять сайт и эти правила. Когда правила меняются, меняется и дата вверху этой страницы."
          ]
        }
      ]
    }
  },

  az: {
    draftNote: "Qaralama: mətni hələ Herdy və Nihad yoxlamalıdır.",
    updated: "Yenilənib: 4 oktyabr 2026",
    contactPlaceholder: "[ƏLAQƏ ÜÇÜN E-POÇT — əlavə ediləcək]",
    privacy: {
      title: "Məxfilik",
      intro:
        "Exampeak 9-cu sinif şagirdlərinin imtahanlara hazırlaşması üçün saytdır. Bu səhifədə sadə sözlərlə sizin haqqınızda nəyi saxladığımız, bunu kimin gördüyü və hamısını necə silmək olduğu yazılıb.",
      sections: [
        {
          heading: "Nəyi saxlayırıq",
          paragraphs: [
            "Hesabsız: həll etdiyiniz testlər, cavablarınız və ballarınız. Onlar adınıza deyil, brauzerinizdə saxlanılan təsadüfi koda bağlıdır.",
            "Hesabla: adınız, e-poçt ünvanınız, istifadəçi adınız, əlavə etsəniz profil şəkliniz və həll etdiyiniz bütün testlərin tarixçəsi (suallar, cavablarınız, ballarınız və tarixlər).",
            "Google ilə daxil olursunuzsa, adınız, e-poçt ünvanınız və şəkliniz Google hesabınızdan götürülür.",
            "Bütün bunlar saytın işlədiyi verilənlər bazası xidməti olan Supabase-də saxlanılır."
          ]
        },
        {
          heading: "Brauzerinizdə nə qalır",
          paragraphs: [
            "Saytın dili, işıqlı və ya qaranlıq rejim, girişiniz və hazırda həll etdiyiniz test brauzerinizdə saxlanılır ki, qayıdanda sayt işləsin. Brauzerdə bu saytın məlumatlarını təmizləsəniz, bunlar silinəcək."
          ]
        },
        {
          heading: "Kim nəyi görür",
          paragraphs: [
            "Öz hesabınız haqqında hər şeyi profilinizdə və test tarixçənizdə görürsünüz.",
            "Qəbul etdiyiniz dostlar adınızı, istifadəçi adınızı, şəklinizi və test göstəricilərinizi görür: neçə test həll etdiyinizi, ən yaxşı və orta nəticənizi və sonuncu testi nə vaxt həll etdiyinizi. Onlar cavablarınızı və e-poçt ünvanınızı görmür.",
            "Kiməsə dostluq sorğusu göndərəndə və ya kimsə sizə göndərəndə, həmin şəxs adınızı, istifadəçi adınızı və şəklinizi görür.",
            "Exampeak-i idarə edənlər saytın işləməsi üçün saxlanılan məlumatları görə bilər."
          ]
        },
        {
          heading: "Yazılı cavablar və süni intellektlə yoxlama",
          paragraphs: [
            "Bəzi suallarda cavabı öz sözlərinizlə yazmaq lazımdır. Onu yoxlamaq üçün cavabınız və sualın özü süni intellektlə yoxlama xidmətinə (Anthropic şirkətinin Claude xidməti) göndərilir. Adınız və e-poçt ünvanınız onlarla birlikdə göndərilmir."
          ]
        },
        {
          heading: "Hamısını necə silmək olar",
          paragraphs: [
            "Profilə keçin və «Hesabımı sil» düyməsini seçin. Bu, profilinizi, şəklinizi, dost siyahınızı və həll etdiyiniz bütün testləri birdəfəlik silir. Bunu geri qaytarmaq olmur.",
            "Hesabsız həll edilmiş testlər yalnız brauzerinizdəki təsadüfi koda bağlıdır. Brauzerdə bu saytın məlumatlarını təmizləsəniz, həmin kod silinəcək."
          ]
        },
        {
          heading: "Suallar",
          paragraphs: ["Bu səhifə ilə bağlı sualınız varsa, bizə yazın: {contact}."]
        }
      ]
    },
    terms: {
      title: "İstifadə şərtləri",
      intro: "Exampeak-dən istifadə qaydaları. Onlar bilərəkdən qısadır.",
      sections: [
        {
          heading: "Exampeak nədir",
          paragraphs: [
            "Buraxılış imtahanlarına hazırlaşan 9-cu sinif şagirdləri üçün məşq saytı. Suallar keçmiş illərin imtahanlarından götürülüb.",
            "Buradakı ballar məşq üçündür. Onlar əsl imtahan nəticənizi nə proqnozlaşdırır, nə də dəyişir."
          ]
        },
        {
          heading: "Hesabınız",
          paragraphs: [
            "Şifrənizi heç kimə deməyin. Başqasının hesabınıza girdiyini düşünürsünüzsə, profilinizdə şifrənizi dəyişin.",
            "Hesab yarada biləcəyinizə əmin deyilsinizsə, əvvəlcə valideyninizdən və ya qəyyumunuzdan soruşun.",
            "Hesabınızı istənilən vaxt profilinizdən silə bilərsiniz. Bunun nəyi sildiyi məxfilik səhifəsində yazılıb."
          ]
        },
        {
          heading: "Başqalarına hörmət",
          paragraphs: [
            "Məktəbdə uyğun sayılacaq ad, istifadəçi adı və şəkil seçin.",
            "Saytı sındırmağa, başqasının hesabına girməyə və ya sual bankını köçürməyə çalışmayın.",
            "Bu qaydaları pozan adı və ya şəkli silə, qaydaları təkrar-təkrar pozan hesabı isə bağlaya bilərik."
          ]
        },
        {
          heading: "Səhvlər",
          paragraphs: [
            "Sualları və cavabları yoxlayırıq, amma bəzilərində yenə səhv ola bilər. Səhv tapsanız, bizə yazın: {contact}.",
            "Sayt bəzən, məsələn yenilənərkən, açılmaya bilər."
          ]
        },
        {
          heading: "Dəyişikliklər",
          paragraphs: [
            "Saytı və bu qaydaları dəyişə bilərik. Qaydalar dəyişəndə bu səhifənin yuxarısındakı tarix də dəyişir."
          ]
        }
      ]
    }
  }
};

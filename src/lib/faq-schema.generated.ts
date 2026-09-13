// GENERATED FILE — do not edit. Run `npm run gen:faq` after changing
// src/content/faq/*.mdx. faq-schema.generated.test.ts fails when this drifts.

export type FaqEntry = { question: string; answer: string };

export const FAQ_ENTRIES: Record<string, readonly FaqEntry[]> = {
    en: [
        {
            question: 'Can you read my secret?',
            answer: 'No, and you can check that yourself. The secret is encrypted in your browser before it is sent, and the key stays after the # in the link — browsers are built so that this part of the address never travels to a server. Open the Network tab in your developer tools while you create a link: the request carries ciphertext and nothing else. The full mechanism is on the Security page.',
        },
        {
            question: 'What if you get breached or receive a legal order?',
            answer: 'There would be nothing to hand over. Storage holds ciphertext and a fingerprint of the access token; the key is not there and never was, so neither we nor anyone who reaches our servers can decrypt it. What is visible — an IP, a timestamp, a size — is listed in the threat model.',
        },
        {
            question: 'The recipient says the link was already burned, but they never opened it',
            answer: 'That does not happen with Getsecret. Corporate mail filters and link-preview bots in chat apps really do fetch URLs ahead of the human, and on many one-time-secret services that burns the secret before anyone reads it. Here a bot cannot burn it: the key lives in the fragment, which never reaches the server, and decryption starts on a button press rather than on page load. If a link really is burned, a person opened it or the timer ran out. That is a signal in itself, but only when a single read was allowed: a burned link at your recipient then means someone else got the secret, and it needs rotating immediately. With several reads there is no signal — an interceptor reads one, the counter drops, and your recipient still sees the secret and suspects nothing.',
        },
        {
            question: 'I sent the link to the wrong person. Can I revoke it?',
            answer: 'If nobody has opened it yet, open it yourself: the secret burns and no one else gets it. Once it has been opened there is nothing to revoke — the secret was read, and we cannot tell you by whom or when. Rotate whatever you sent.',
        },
        {
            question: 'What if the link is intercepted in transit?',
            answer: 'Whoever intercepts it opens the secret first and burns it in the process. With a single read allowed you will notice: your recipient sees a burned link instead of the secret, which tells you the channel is compromised and the credential needs rotating. With several reads you will not: one is enough for the interceptor, the next goes to your recipient, and nobody suspects a thing. A link with a password on it is useless to an interceptor either way.',
        },
        {
            question: 'Can I put a password on a link?',
            answer: 'Yes, when you create it. The password never reaches the server: your browser derives a second key from it (PBKDF2-SHA256, 600,000 iterations) and encrypts the secret again, on top of the first layer. The server stores only a fingerprint for verification, and the password cannot be recovered from it. Five wrong attempts destroy the record.',
        },
        {
            question: 'Why add a password if the link is one-time anyway?',
            answer: 'Because the link can go somewhere you did not intend while the password stays with you. Being one-time protects against a second read, not against the wrong person seeing the first one: forwarded to the wrong thread, delivered to a shared team inbox, read off an unlocked phone on a desk. With a password, an intercepted link is useless — it carries only ciphertext. This works when the link and the password travel through different channels: link by email, password by voice. More on the Security page.',
        },
        {
            question: 'Do I have to invent a new password every time?',
            answer: 'No, and with regular correspondents it is easier to agree once. Settle it with a colleague over a separate channel — by voice, in person — that every link between you opens with the same phrase. After that you just send the link: the second channel is never needed again, and an intercepted link still gives nothing away. The cost of that convenience is that the phrase becomes a long-lived secret. Use a long phrase rather than a word: anyone holding the link can attack the password offline, and length is the only thing slowing them down. Each secret carries its own salt, so two links have to be attacked separately — cracking one does not open the rest. Change the phrase when someone leaves the project.',
        },
        {
            question: 'Can a link be opened more than once?',
            answer: 'Yes, if you allow more than one read when creating it. The counter drops with every read and the record is deleted on the last one — the same one-time link, just with a different threshold. The expiry runs on its own schedule: once it passes, the secret is gone no matter how many reads were left. Several reads come at a cost. A single read makes interception visible: your recipient finds the link burned and tells you. Several reads remove that signal, because one read is enough for an interceptor and the next one still goes to your recipient. Leave it at one read if you want to find out when a link is intercepted.',
        },
        {
            question: 'How long does a link live, and what if nobody opens it?',
            answer: 'A day by default, thirty at most — you choose when you create it. If nobody opens the link, the secret is deleted when the time runs out: the timer does not care whether anyone read it.',
        },
        {
            question: 'Can I send a file?',
            answer: 'Yes, up to 25 MB. The file is encrypted in your browser exactly like text: ciphertext goes to storage, the key stays in the link fragment.',
        },
        {
            question: 'Why send a file as a link instead of dropping it into chat?',
            answer: "Because in a chat the file stays forever. A screenshot of a passport, a contract, an export full of personal data — sent once, and then they sit in your history, in the recipient's history, in the chat app's cloud, and in their phone backup. A year later nobody remembers what was in it, and nobody cleans it up. A one-time link removes the permanent copy in the middle. The recipient downloads the file, and on our side the encrypted blob is deleted within two days — by then it cannot be decrypted anyway, since the key disappeared on the first open. The downloaded file stays on the recipient's disk: that copy is theirs to manage.",
        },
        {
            question: 'How long can a secret be?',
            answer: 'Up to 10,000 characters, roughly five pages of text. Enough for a password, a private key, or an entire .env.',
        },
        {
            question: 'Do I need an account, and what does it cost?',
            answer: 'Neither an account nor a payment. There is no registration at all — anyone who opens the site can create a link. The code is AGPL-licensed, and you can run your own instance from source.',
        },
        {
            question: 'Does the recipient need to install anything?',
            answer: "No, a browser is enough. Decryption happens on their side using the browser's own Web Crypto — no extension, no app, no sign-up.",
        },
        {
            question: 'Why bother when I have a password manager?',
            answer: 'A password manager stores; Getsecret hands over. Sharing inside a manager leaves an entry somebody has to remember to revoke later, and a contractor, a new hire or a client usually has no way into your manager at all. A one-time link covers the moment of handover and leaves nothing behind.',
        },
        {
            question: 'How is this better than disappearing messages in a chat app?',
            answer: "A disappearing message is removed from the other person's screen but stays with the service and in their phone backup. Getsecret never sees the plaintext at all, so there is nothing on our side to delete. And the expiry here does not depend on whether the recipient opened the app.",
        },
    ],
    ru: [
        {
            question: 'Вы можете прочитать мой секрет?',
            answer: 'Нет, и вы можете это проверить. Секрет шифруется в вашем браузере до отправки, а ключ остаётся после # в ссылке — браузеры устроены так, что эта часть адреса на сервер не уходит. Откройте вкладку «Сеть» в инструментах разработчика, когда создаёте ссылку: в запросе будет только шифротекст. Как это устроено целиком — в разделе Безопасность.',
        },
        {
            question: 'А если вас взломают или придёт запрос по закону?',
            answer: 'Отдавать будет нечего. В хранилище лежат шифротекст и отпечаток токена доступа; ключа там нет и никогда не было, поэтому расшифровать не сможем ни мы, ни тот, кто получит доступ к серверам. Что при этом всё-таки видно — IP, время, размер — перечислено в модели угроз.',
        },
        {
            question: 'Получатель говорит, что ссылка уже сожжена, хотя он её не открывал',
            answer: 'С Getsecret так не бывает. Корпоративные почтовые фильтры и боты предпросмотра в мессенджерах действительно ходят по ссылкам заранее, и на многих сервисах одноразовых ссылок это сжигает секрет до того, как его увидит человек. Здесь бот не может его сжечь: ключ лежит во фрагменте, который до сервера не доходит, а расшифровка запускается нажатием кнопки, а не загрузкой страницы. Если ссылка всё-таки сожжена — её открыл человек либо истёк срок. И это само по себе сигнал, но только при одном разрешённом прочтении: тогда сожжённая ссылка у адресата означает, что секрет достался кому-то другому, и менять его нужно немедленно. С несколькими прочтениями сигнала нет — чужой прочитает, счётчик уменьшится, а ваш получатель всё равно увидит секрет и ничего не заподозрит.',
        },
        {
            question: 'Я отправил ссылку не тому человеку. Можно её отозвать?',
            answer: 'Пока её не открыли — откройте сами: секрет сгорит и не достанется никому. Если её уже открыли, отзывать нечего: секрет прочитан, и мы не знаем ни кем, ни когда. Меняйте то, что передавали.',
        },
        {
            question: 'Что будет, если ссылку перехватят по дороге?',
            answer: 'Перехвативший откроет секрет первым и этим его сожжёт. При одном разрешённом прочтении вы это заметите: получатель увидит сожжённую ссылку вместо секрета — значит, канал скомпрометирован и сам секрет пора менять. Если прочтений несколько, заметить не выйдет: чужому хватит одного, получателю достанется следующее, и никто ничего не заподозрит. Ссылка с паролем перехватившему бесполезна в любом случае.',
        },
        {
            question: 'Можно ли поставить на ссылку пароль?',
            answer: 'Да, при создании. Пароль на сервер не уходит: браузер выводит из него второй ключ (PBKDF2-SHA256, 600 000 итераций) и шифрует секрет ещё раз, поверх основного слоя. Сервер хранит только отпечаток для проверки — подобрать по нему пароль нельзя. После пяти неверных попыток запись уничтожается.',
        },
        {
            question: 'Зачем пароль, если ссылка и так одноразовая?',
            answer: 'Затем, что ссылка может уйти не туда, а пароль при этом остаётся у вас. Одноразовость защищает от повторного чтения, но не от того, что ссылку увидит не тот человек: переслали не в тот чат, письмо ушло в общий ящик отдела, телефон получателя лежит разблокированным на столе. С паролем перехваченная ссылка бесполезна — в ней только шифротекст. Работает это, когда ссылка и пароль идут разными каналами: ссылка в почте, пароль голосом. Подробнее — в разделе Безопасность.',
        },
        {
            question: 'Нужно ли каждый раз придумывать новый пароль?',
            answer: 'Нет, и с постоянными адресатами удобнее договориться один раз. Условьтесь с коллегой по отдельному каналу — голосом или при встрече — что все ссылки между вами открываются одной и той же фразой. Дальше достаточно отправить ссылку: второй канал больше не нужен, а перехваченная ссылка по-прежнему ничего не даёт. Плата за удобство — эта фраза становится долгоживущим секретом. Берите длинную фразу, а не слово: тот, к кому попала ссылка, может подбирать пароль офлайн, и мешает ему только длина. Соль у каждого секрета своя, поэтому две ссылки подбираются по отдельности — разгаданная одна не открывает остальные. Меняйте фразу, когда человек уходит из проекта.',
        },
        {
            question: 'Можно ли открыть ссылку несколько раз?',
            answer: 'Да, если при создании поставить больше одного прочтения. Счётчик уменьшается с каждым открытием, и на последнем запись удаляется — та же одноразовая ссылка, просто порог другой. Срок жизни при этом работает сам по себе: истёк — секрет удалён, сколько бы прочтений ни оставалось. У нескольких прочтений есть цена. Одно прочтение делает перехват заметным: получатель находит ссылку сожжённой и сообщает вам. Несколько прочтений этот сигнал убирают, потому что чужому хватит одного, а получателю достанется следующее. Если важно узнать о перехвате, оставляйте одно прочтение.',
        },
        {
            question: 'Сколько живёт ссылка и что будет, если её никто не откроет?',
            answer: 'По умолчанию сутки, максимум 30 дней — срок выбираете при создании. Если ссылку не открыли, секрет удалится сам, когда выйдет срок: таймер идёт независимо от того, читал её кто-нибудь или нет.',
        },
        {
            question: 'Можно ли отправить файл?',
            answer: 'Да, до 25 МБ. Файл шифруется в браузере так же, как текст: в хранилище уезжает шифротекст, ключ остаётся во фрагменте ссылки.',
        },
        {
            question: 'Зачем отправлять файл ссылкой, а не просто в чат?',
            answer: 'Потому что в чате файл остаётся навсегда. Скриншот с паспортом, договор, выгрузка с персональными данными — отправили один раз, а лежат они и у вас в истории, и у получателя, и в облаке мессенджера, и в резервной копии его телефона. Через год никто не помнит, что там было, и никто этого не чистит. Одноразовая ссылка убирает постоянную копию посередине. Получатель скачивает файл, а у нас зашифрованный блоб удаляется в течение двух суток — расшифровать его к тому моменту невозможно, ключ исчез при первом же открытии. Скачанный файл остаётся у получателя на диске: это его копия, и распоряжается ею он.',
        },
        {
            question: 'Какой длины может быть секрет?',
            answer: 'До 10 000 символов — примерно пять страниц текста. Хватает на пароль, приватный ключ или .env целиком.',
        },
        {
            question: 'Нужен ли аккаунт и сколько это стоит?',
            answer: 'Ни аккаунта, ни оплаты. Регистрации нет вообще — создать ссылку может любой, кто открыл сайт. Код открыт под лицензией AGPL, свой экземпляр можно развернуть из исходников.',
        },
        {
            question: 'Нужно ли получателю что-то устанавливать?',
            answer: 'Нет, достаточно браузера. Расшифровка идёт на его стороне средствами браузера (Web Crypto) — ни расширений, ни приложений, ни регистрации.',
        },
        {
            question: 'Зачем это, если есть менеджер паролей?',
            answer: 'Менеджер хранит, Getsecret передаёт. Общий доступ в менеджере оставляет запись, которую потом надо не забыть отозвать, а подрядчику, новому сотруднику или клиенту в ваш менеджер обычно вообще не попасть. Одноразовая ссылка закрывает именно момент передачи и следа не оставляет.',
        },
        {
            question: 'Чем это лучше исчезающих сообщений в мессенджере?',
            answer: 'Исчезающее сообщение удаляется у собеседника, но остаётся у сервиса и в облачной копии телефона. Getsecret открытого текста не видит вообще, поэтому удалять у нас нечего. И срок здесь не зависит от того, открыл ли получатель приложение.',
        },
    ],
};

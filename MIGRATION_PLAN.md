# План миграции на новый дизайн + password + max views

## Контекст

В `new_design/` лежит монолитный React-прототип от Claude Code Design (Sharer.am.html + app.jsx + styles.css + i18n.jsx + icons.jsx + tweaks-panel.jsx). Прототип несёт три новые вещи поверх текущего приложения:

1. **Пароль на секрет** (опциональный) — UI создания готов; UI просмотра в дизайне НЕ предусмотрен (пробел дизайна, нужно дополнять).
2. **Max views** (1, 3, 5, 10, ∞) — UI готов; consume сейчас деструктивный, нужны изменения в Lua и хранилище.
3. **TTL с минутами** — сейчас есть hours/days, надо добавить minutes (минимум секунд в `expiration.ts` уже = 1, фронт-валидация).

Параллельно дизайн меняет всю визуальную систему (тёмная/светлая тема с переключением, Inter+JetBrains Mono, иконки, header/footer, 5-стейтный флоу, 7 языков), а в навигации появляются ссылки на ещё не существующие страницы (Docs, Security, API, Source).

В дизайне на экране `generated` есть кнопка "QR code" (`<Icon.QrCode />`) — но реализация её отсутствует. Это нужно довести до рабочего состояния отдельным этапом.

Прототип НЕ содержит подсветки синтаксиса на просмотре (мы недавно добавили её в `secret-viewer.tsx` через `highlight-secret.ts` — это нужно сохранить и расширить на новый layout).

Решения, принятые до написания плана:
- **Пароль реализуется двойным шифрованием** (true zero-knowledge): plaintext → AES-GCM с inner-key из PBKDF2(password, salt) → AES-GCM с outer-key из URL-фрагмента. Сервер хранит salt, iterations и `passwordVerifierHash` (SHA256 от верификатора, чтобы блокировать брутфорс через consume без consume-штрафа за неверный пароль).
- **i18n на 7 языков сразу** через next-intl с URL-префиксами `/en|/zh|/ru|/es|/it|/de|/fr` (для SEO с hreflang).
- **5 этапов на одной ветке миграции** — каждый этап — отдельный shippable PR.
- **Stub-страницы**: минимальный SEO-каркас (H1 + 1-2 параграфа, корректные `<title>`, meta description, canonical, OpenGraph). Без "Coming soon" заглушек.

Tweaks panel из дизайна не переносим (это отладка для дизайнера через `postMessage` с parent).

---

## Итоговая структура `src/`

```
src/
├── app/
│   ├── [locale]/                          ← next-intl routing
│   │   ├── layout.tsx                     ← NextIntlClientProvider, ThemeProvider, SiteHeader, SiteFooter
│   │   ├── page.tsx                       ← главная (CreateForm)
│   │   ├── docs/page.tsx                  ← stub
│   │   ├── security/page.tsx              ← stub
│   │   ├── developers/page.tsx            ← stub (а не /api — конфликт с API-роутами)
│   │   ├── faq/page.tsx                   ← stub
│   │   └── s/[id]/page.tsx                ← viewer (SSR с расширенными metadata)
│   ├── api/
│   │   └── secrets/
│   │       ├── route.ts                   ← +maxViews, +passwordParams, +passwordVerifierHash
│   │       └── [id]/route.ts              ← +passwordVerifierHash, ответ +viewsRemaining
│   ├── layout.tsx                         ← root html/body, шрифты через next/font
│   ├── globals.css                        ← портированы стили из new_design/styles.css
│   ├── sitemap.ts                         ← генератор по роутам × locales с hreflang
│   ├── robots.ts                          ← разрешение /, запрет /s/* и /api/*
│   ├── opengraph-image.tsx                ← дефолтная OG-картинка
│   └── not-found.tsx
├── components/
│   ├── ui/                                ← переиспользуемые примитивы
│   │   ├── button.tsx                     ← variant: primary|secondary|ghost|danger|icon
│   │   ├── input.tsx, textarea.tsx
│   │   ├── segmented.tsx, stepper.tsx, pill.tsx
│   │   ├── dropdown.tsx                   ← база для FormatSelect, LangPicker
│   │   ├── icons.tsx                      ← портировано из new_design/icons.jsx
│   │   ├── feature-row.tsx
│   │   └── toast.tsx                      ← обобщён из existing copy-button.tsx
│   ├── layout/
│   │   ├── site-header.tsx, site-footer.tsx
│   │   ├── lang-picker.tsx, theme-switch.tsx
│   ├── secret/
│   │   ├── create-form.tsx                ← рефакторинг src/components/secret-form.tsx
│   │   ├── secret-textarea.tsx            ← textarea + highlight overlay (выделить из form)
│   │   ├── format-select.tsx              ← кастомный dropdown из дизайна
│   │   ├── ttl-control.tsx                ← stepper + segmented [minutes|hours|days]
│   │   ├── max-views-control.tsx          ← NEW — segmented [1|3|5|10|∞]
│   │   ├── password-field.tsx             ← NEW — input + eye toggle
│   │   ├── generated-link.tsx             ← пост-create экран со stats grid
│   │   ├── viewer.tsx                     ← рефакторинг secret-viewer.tsx (контейнер с тремя state machines)
│   │   ├── lock-screen.tsx                ← pre-reveal с countdown, опционально PasswordPrompt
│   │   ├── password-prompt.tsx            ← NEW
│   │   ├── revealed-secret.tsx            ← post-reveal display с highlight + show/hide blur
│   │   └── burned-screen.tsx              ← 404/used/locked-out состояние
│   ├── theme-provider.tsx                 ← обёртка next-themes
│   └── copy-button.tsx                    ← оставляем (используется в нескольких местах)
├── i18n/
│   ├── routing.ts                         ← locales, defaultLocale, pathnames
│   ├── request.ts                         ← getRequestConfig для server components
│   └── messages/
│       ├── en.json … fr.json              ← перенос из new_design/i18n.jsx + добавление новых ключей
├── lib/
│   ├── secret-crypto.ts                   ← +password layer (PBKDF2 + AES-GCM wrap), bump SECRET_VERSION → 2
│   ├── secret-store.ts                    ← +maxViews/viewsUsed/passwordSalt/passwordIterations/passwordVerifierHash в Hash; новый OPEN_SCRIPT
│   ├── secret-formats.ts                  ← без изменений
│   ├── highlight-secret.ts                ← без изменений (lazy + alias toml→ini, html→xml)
│   ├── expiration.ts                      ← +minutes constant; min/max уже валидны
│   ├── max-views.ts                       ← NEW — MAX_VIEW_PRESETS, isValidMaxViews
│   ├── password-policy.ts                 ← NEW — MIN_PASSWORD_LENGTH=8, validate
│   ├── password-derive.ts                 ← NEW — PBKDF2 helpers (выделить из crypto для тестируемости)
│   ├── rate-limit.ts                      ← без изменений
│   ├── valkey-client.ts                   ← без изменений
│   ├── http.ts                            ← без изменений
│   └── create-secret-link.ts              ← +password, +maxViews параметры
└── proxy.ts                               ← next-intl middleware (через convention proxy.ts из текущего проекта)
```

---

## Этап 1 — Foundation (PR #1)

**Цель:** перевести приложение на новую визуальную систему без новых фич. Текущий функционал (создание + просмотр + format/highlight) работает как раньше, но в новом облике.

### 1.1 Дизайн-система и стили
- Перенос `new_design/styles.css` в `src/app/globals.css` (1245 строк → расчищенные токены). CSS-переменные для тёмной/светлой темы. Переключение через `data-theme` на `<html>`.
- Подключение Inter и JetBrains Mono через `next/font` в `src/app/layout.tsx` (сейчас захардкожены в CSS — теряем оптимизацию).
- `next-themes` для системной темы + persistence в localStorage. Setup: `<ThemeProvider attribute="data-theme" enableSystem defaultTheme="system">`. Чтобы избежать FOUC (flash of unstyled content) на first paint — использовать рекомендованный inline-скрипт next-themes в `<head>`, который выставляет `data-theme` до гидратации. На корневом `<html lang={locale} suppressHydrationWarning>` чтобы не получать hydration warning от theme-атрибута.
- Анимации `fadeUp`, `flicker`, `pulse` из дизайна.
- Иконки: `new_design/icons.jsx` → `src/components/ui/icons.tsx` (24 иконки, inline SVG, currentColor stroke).

### 1.2 UI-примитивы
Создать `src/components/ui/`:
- `button.tsx` (variants: primary | secondary | ghost | danger | icon)
- `input.tsx`, `textarea.tsx` — обёртки над нативными с focus-ring + glow
- `segmented.tsx` — на базе `aria-pressed` toggle pattern из текущего `ttl-toggle`
- `stepper.tsx` — number input с +/- кнопками
- `pill.tsx` — variants accent | ember | muted | danger
- `dropdown.tsx` — базовый useState(open) + click-outside
- `feature-row.tsx` — небольшие info-боксы с иконкой
- `toast.tsx` — обобщить `ToastMessage` из `src/components/copy-button.tsx`. `useClipboardCopy` оставляем там же.

### 1.3 i18n инфраструктура (next-intl)
- `npm install next-intl`
- `src/i18n/routing.ts`: `locales = ['en', 'zh', 'ru', 'es', 'it', 'de', 'fr']`, defaultLocale `'en'`, pathnames для локализованных URL-сегментов (`/security` ⇄ `/seguridad` опционально, на старте один путь).
- `src/i18n/request.ts`: `getRequestConfig` подгружает messages из `src/i18n/messages/{locale}.json`.
- `src/proxy.ts`: использовать `createMiddleware` из next-intl. **Важно:** проект уже на конвенции `proxy.ts` (см. commit b609980). Нужно совместить с этим — экспортировать единый middleware-handler.
- Сообщения: разобрать `new_design/i18n.jsx` (объект `window.I18N` со всеми 7 языками) → 7 JSON-файлов с неймспейсами `nav`, `eyebrow`, `create`, `generated`, `reveal`, `revealed`, `burned`, `toast`, `foot`. Добавить новые ключи для `password`, `maxViews`, `errors`. **Перенос текстов руками файл к файлу — самая трудоёмкая часть PR #1.**
- Для виджетов `<LangPicker>` использовать тот же `LANG_ORDER` со флагами.

### 1.4 Layout-компоненты и роутинг под `[locale]`
- Переехать со страниц `src/app/page.tsx` и `src/app/s/[id]/page.tsx` на `src/app/[locale]/page.tsx` и `src/app/[locale]/s/[id]/page.tsx` (next-intl App Router pattern).
- `src/app/[locale]/layout.tsx`: оборачивает в `NextIntlClientProvider`, `ThemeProvider`, `SiteHeader`, `SiteFooter`. `generateStaticParams` для всех локалей.
- `src/app/layout.tsx` — корневой, без локали (только html/body + шрифты).
- `SiteHeader`: логотип, nav-links (Docs / Security / API / Source), статичная зелёная точка "All systems operational" (без подключения к health endpoint — чисто декоративный statement, как в дизайне), `LangPicker`, `ThemeSwitch`.
- `SiteFooter`: копирайт, ссылки, версия (читаем из `package.json`).

### 1.5 Stub-страницы
Создать `[locale]/docs/page.tsx`, `[locale]/security/page.tsx`, `[locale]/developers/page.tsx`, `[locale]/faq/page.tsx`. Каждая:
- Server component, `export const metadata = { title, description, openGraph, alternates: { canonical, languages } }`.
- H1 + 1-2 параграфа описания.
- Перевод заголовков и описаний во все 7 локалей.
- В nav `Source` остаётся внешней ссылкой на GitHub (target=_blank).

### 1.6 SEO-инфраструктура
- `src/app/sitemap.ts`: генерация по {`/`, `/docs`, `/security`, `/developers`, `/faq`} × 7 locales с правильными `alternates.languages`.
- `src/app/robots.ts`: allow `/`, `/docs`, `/security`, `/developers`, `/faq` (×7 локалей); disallow `/*/s/*` (locale-prefixed viewer пути — `/en/s/abc`, `/ru/s/abc`, ...) и `/api/*` (API-роуты без locale-префикса). Образец: `Disallow: /*/s/*`, `Disallow: /api/*`.
- В `src/app/[locale]/s/[id]/page.tsx` добавить `export const metadata = { robots: { index: false, follow: false } }` — random IDs не должны индексироваться поисковиками даже при утечке URL в логах/реферерах.
- `src/app/opengraph-image.tsx`: дефолтная OG-картинка через next/og.
- В `src/app/[locale]/layout.tsx` `generateMetadata` для hreflang-альтернатив.

### 1.7 Что менять минимально на этом этапе
- `secret-form.tsx` и `secret-viewer.tsx` остаются по поведению идентичными, но переезжают на новые UI-примитивы и новые CSS-классы.
- API-роуты НЕ трогаем (оставим на этапы 3 и 4).
- Lua-скрипты НЕ трогаем.
- Подсветка синтаксиса остаётся как есть (`secret-form.tsx` строки 43-65, `secret-viewer.tsx` соответствующая логика после reveal). Просто новая обёртка стилей.

### 1.8 Verification (этап 1)
- `npm run check && npm test` — все существующие тесты должны пройти без изменений (никакой бизнес-логики не тронуто).
- Локально: создать секрет → перейти по ссылке → раскрыть. Проверить во всех 7 локалях через `LangPicker`. Проверить переключение тем. Проверить что highlight.js работает при выборе формата.
- Проверить SSR: `view-source:` главной страницы должен содержать локализованный H1 и meta description.
- `curl https://localhost:3000/sitemap.xml` — все URL × 7 локалей с hreflang.
- Lighthouse на главной: SEO score 100, accessibility 100, dark/light themes оба зелёные.

---

## Этап 2 — Component refactor + minutes (PR #2)

**Цель:** разбить монолитные `secret-form.tsx` и `secret-viewer.tsx` на компоненты, готовые принять новые поля. Добавить minutes в TTL.

### 2.1 Декомпозиция формы создания
`src/components/secret/create-form.tsx` (новый контейнер) композиция:
- `<SecretTextarea format={format} value={secret} onChange={...} />` — текстарея + highlight overlay (вынести логику из `secret-form.tsx` строк 43-65, 158-184)
- `<FormatSelect value={format} onChange={setFormat} />` — кастомный dropdown из дизайна на 14 форматов (вместо нативного `<select>`). Использовать `SECRET_FORMATS` и `SECRET_FORMAT_LABELS` из `src/lib/secret-formats.ts`.
- `<TtlControl value={ttlValue} unit={ttlUnit} onChange={...} />` — stepper + segmented `[minutes | hours | days]`.
- Submit button + результирующий `<GeneratedLink link={link} payload={...} />` (когда `link` присутствует).

### 2.2 Декомпозиция viewer
`src/components/secret/viewer.tsx` контейнер с тремя state machines (`LinkState`, `SecretState`, `ReshareState` — оставить как сейчас в `secret-viewer.tsx`). Подкомпоненты:
- `<LockScreen secretMeta={...} onReveal={...} />` — иконка, countdown, кнопка "Reveal & burn secret". `<ExpiryCountdown />` уже есть, переносим внутрь.
- `<RevealedSecret content={content} format={format} highlightedHtml={...} onReshare={...} />` — output box с blur-toggle, кнопкой Copy, секцией "Share something back".
- `<BurnedScreen reason="not-found" | "used" | "locked-out" />` — flame icon, текст в зависимости от причины.

`SecretState.revealed` уже хранит `highlightedHtml`. Сохраняем эту логику. Подсветка после reveal — динамический import `@/lib/highlight-secret` (как сейчас).

### 2.3 TTL: добавить minutes
- `src/lib/expiration.ts`: `MIN_EXPIRATION_SECONDS = 1` уже валиден. Добавить `MINUTES_PRESET`, `HOURS_PRESET`, `DAYS_PRESET` константы для UI.
- `src/components/secret/ttl-control.tsx`: TtlUnit = `'minutes' | 'hours' | 'days'`. Логика `unitSeconds`, `maxValueForUnit` — расширить.
- Дефолт: `1 day` (текущий).
- Серверная валидация в `/api/secrets/route.ts` использует уже существующий `isValidExpirationSeconds` — менять не нужно.

### 2.4 Подготовка контракта под новые фичи (без активации)
- В `src/lib/create-secret-link.ts` сигнатура `createSecretLink(secret, expiresInSeconds?, format?, options?)` — добавить опции `password?: string`, `maxViews?: number | null`, но пока no-op (бросают ошибку или игнорируются на сервере).
- Это нужно только если в одном PR проще оставить пустые поля. Альтернатива: ввести их вместе с этапами 3 и 4. Я бы оставил на этапе 3 (`maxViews`) и 4 (`password`).

### 2.5 Verification (этап 2)
- Существующие тесты (`secret-crypto.test.ts`, `secret-store.test.ts`, `secret-store via routes.test.ts`) проходят без изменений.
- Добавить визуальную проверку всех 5 экранов (create, generated, reveal, revealed, burned-as-not-found) с обоими темами и mobile viewport.
- E2E: создать → кликнуть generated link → reveal → reshare. Проверить highlight на JSON и Python.
- Проверить minutes: создать секрет на 5 минут → дождаться истечения → попытаться открыть → 404.

---

## Этап 3 — Max views (PR #3)

**Цель:** дать создателю ограничивать количество просмотров (1, 3, 5, 10, ∞). Сейчас consume в `secret-store.ts:CONSUME_SCRIPT` всегда удаляет хеш — это надо изменить.

### 3.1 Изменения в Valkey-хранилище
В Hash дополнительные поля:
- `maxViews` — integer >= 1 или отсутствует/пусто = unlimited.
- `viewsUsed` — integer, default `0`.

`CREATE_SCRIPT` в `src/lib/secret-store.ts`:
```lua
redis.call('HSET', KEYS[1],
    'encryptedSecret', ARGV[1],
    'accessTokenHash', ARGV[2],
    'expiresAt', ARGV[3],
    'failedAttempts', '0',
    'format', ARGV[5],
    'maxViews', ARGV[6],          -- '' если unlimited
    'viewsUsed', '0')
redis.call('PEXPIRE', KEYS[1], ARGV[4])
```

`CONSUME_SCRIPT` (переименовать в `OPEN_SCRIPT`):
- После constant-time match — `HINCRBY viewsUsed 1`.
- Если `maxViews` не пустая И `viewsUsed >= maxViews` → `DEL`.
- Возвращать `{'ok', encryptedSecret, format, viewsRemaining}` где `viewsRemaining = maxViews - viewsUsed`, или `'-1'` для unlimited.

`getMetadata` расширить: возвращать `{ expiresAt, maxViews, viewsUsed }` (для SSR на /s/[id]).

**Backward-compat для in-flight v1 секретов:** на момент деплоя этапа 3 в Valkey могут жить hashes без полей `maxViews` и `viewsUsed` (TTL до 30 дней). `OPEN_SCRIPT` должен явно обрабатывать missing fields в Lua:
- `local maxViewsRaw = redis.call('HGET', KEYS[1], 'maxViews')` → если `false` (Redis nil) или пусто, использовать `'1'` (сохраняет burn-after-read семантику старых секретов).
- `local viewsUsedRaw = redis.call('HGET', KEYS[1], 'viewsUsed')` → если `false`, использовать `'0'`.

Это безопаснее, чем миграционный скрипт, проставляющий defaults на существующие keys: фолбэк в Lua не требует деплой-координации и работает на любых in-flight данных.

**Расширение типа `ConsumedSecret`:**
```ts
export type ConsumedSecret = {
    encryptedSecret: EncryptedSecret;
    format: SecretFormat;
    viewsRemaining: number | null;  // null = unlimited
};
```
TS-обёртка `consume()` конвертирует Lua-возврат `'-1'` → `null`.

### 3.2 Новые helpers
`src/lib/max-views.ts`:
- `MAX_VIEW_PRESETS = [1, 3, 5, 10] as const` (плюс `null` для ∞).
- `MAX_VIEWS_HARD_CAP = 10` — серверная валидация против произвольных значений.
- `isValidMaxViews(value): value is number | null`.

### 3.3 Изменения API
`POST /api/secrets/route.ts`:
- Принимать `maxViews?: number | null` в body. Валидация через `isValidMaxViews`. По умолчанию `1` (текущее поведение burn-after-read).
- Передавать в `secretStore.create(...)`.

`POST /api/secrets/[id]/route.ts`:
- В ответе добавить `viewsRemaining: number | null` (null для unlimited; `-1` из Lua → null).

`s/[id]/page.tsx` (SSR):
- `secretStore.getMetadata` теперь возвращает дополнительно `maxViews`, `viewsUsed` → пробросить как props в `<Viewer>`.
- На lock-screen показывать "X просмотров осталось" (если maxViews задано).

### 3.4 Поведение клиента при множественных просмотрах
- Каждый POST `/api/secrets/[id]` всегда консьюмит один просмотр. Сейчас `requestedRef` в `secret-viewer.tsx` блокирует повторный POST в рамках одной сессии. С max-views это **сохраняем** — в одной сессии один reveal-клик = один просмотр. Если пользователь перезагружает страницу с тем же URL, он попадает обратно на lock-screen и может снова кликнуть Reveal — это второй просмотр. Это согласуется с UX дизайна.
- На revealed-screen после reveal показать "X views remaining" (если осталось > 0) или "Final view, secret destroyed" (если 0).

### 3.5 Тесты
- `src/lib/secret-store.test.ts`:
  - `consume` ровно `maxViews` раз (для 3, 5, 10).
  - После последнего consume → ключ удалён.
  - С `maxViews = null` (unlimited) → consume много раз, ключ жив (TTL завершит его).
  - Wrong token не декрементит viewsUsed (только failedAttempts), lockout после 5 — секрет удаляется (как сейчас).
  - TTL-истечение пробивает unlimited.
- `src/app/api/secrets/routes.test.ts`:
  - Создание с `maxViews: 3` → три успешных consume, четвёртый = 404.
  - Создание с `maxViews: null` → много consume.
- Существующий тест "consume exactly once" → дефолт без maxViews всё ещё работает (default = 1).

### 3.6 UI на форме
- `<MaxViewsControl>` сегментированный контрол `[1, 3, 5, 10, ∞]` (новый компонент в `secret/max-views-control.tsx`). Дефолт = 1.
- Передаётся в `createSecretLink` как опция.

### 3.7 Verification (этап 3)
- `npm run check && npm test`.
- Создать секрет с maxViews=3, открыть в трёх разных tab'ах → все три раза успех + viewsRemaining корректно. Четвёртый tab → 404.
- Создать с maxViews=∞, открыть 20 раз → всё работает.
- Один tab, refresh после reveal → попадает на lock-screen с уменьшенным счётчиком.
- Брутфорс token (5 попыток) на multi-view секрете → секрет удалён.

---

## Этап 4 — Password protection (PR #4)

**Цель:** дать создателю задавать опциональный пароль. Содержимое не расшифруется без пароля даже при компрометации сервера и URL-фрагмента.

### 4.1 Криптомодель (двойное шифрование + верификатор от брутфорса)

**Создание (если password задан):**
1. `K_outer = random(32 bytes)` — как сейчас, помещается в URL fragment.
2. `iv_outer = random(12 bytes)`.
3. `salt = random(16 bytes)`.
4. `iterations = 600_000` (PBKDF2-SHA256, OWASP 2023+ baseline).
5. `K_inner = PBKDF2-SHA256(passwordUtf8, salt, iterations, 32 bytes)`.
6. `iv_inner = random(12 bytes)`.
7. `inner = AES-GCM-encrypt(plaintext, K_inner, iv_inner)`.
8. `bundle = iv_inner ‖ inner` (байтовая склейка).
9. `outer = AES-GCM-encrypt(bundle, K_outer, iv_outer)`.
10. `verifier = SHA256(K_inner ‖ "burnotes:verifier:v1")` — 32 bytes (одиночный хеш на клиенте).
11. `verifierHash = SHA256(verifier_bytes)` — **двухступенчатая хеш-цепь**, симметричная существующему паттерну `accessToken` / `accessTokenHash`. Клиент отправляет ИМЕННО `verifierHash` на сервер при создании. На открытии клиент шлёт `verifier` (одиночный хеш), сервер хеширует его ещё раз и constant-time сравнивает со stored `verifierHash`. Свойство: компрометация БД даёт атакующему только `verifierHash`, который сам по себе не позволяет форджить запросы (нужен `verifier`, который требует знать `K_inner`, который требует пароль + salt).
12. На сервер отправляется:
    ```
    {
      id, accessToken,
      encryptedSecret: { version: 2, iv: iv_outer, ciphertext: outer },
      passwordParams: { salt, iterations },
      passwordVerifierHash,
      maxViews?, format?, expiresInSeconds?
    }
    ```

**Создание (если password НЕ задан):**
- Текущая схема (1 слой AES-GCM, version 1). Поля `passwordParams` и `passwordVerifierHash` отсутствуют. **Сохраняем backward compatibility:** version=1 секреты должны раскрываться (пока не очищены TTL).

**Раскрытие (с password):**
1. SSR `getMetadata` возвращает `{ expiresAt, viewsRemaining, passwordParams }`. Если `passwordParams != null` → клиент рисует password input в lock-screen.
2. Пользователь вводит password.
3. Клиент: `K_inner = PBKDF2(password, salt, iterations)`.
4. `verifier = SHA256(K_inner ‖ "burnotes:verifier:v1")` → base64url. Это значение — _один_ хеш, отправляется в открытом виде в request body.
5. POST `/api/secrets/[id]` с `{ accessToken, passwordVerifier }`.
6. Сервер (route handler): хеширует `passwordVerifier` ещё раз через `hashAccessToken`-аналог (`SHA256` + base64url), получает `passwordVerifierHash`, передаёт в Lua. Lua constant-time сравнивает с stored `passwordVerifierHash`. Если mismatch → `failedAttempts++`, lockout после 5; не консьюмит view, возвращает 404 (как для wrong token).
7. При match: консьюмит один view, возвращает `{ encryptedSecret, format, viewsRemaining }`.
8. Клиент: 
   - `bundle = AES-GCM-decrypt(outer, K_outer, iv_outer)` — должен пройти (мы знаем правильный K_outer).
   - `iv_inner = bundle[0..12]`, `inner = bundle[12..]`.
   - `plaintext = AES-GCM-decrypt(inner, K_inner, iv_inner)` — auth-tag должен пройти (verifier совпал, значит K_inner верный).

### 4.2 Изменения в `src/lib/secret-crypto.ts`
- Bump `SECRET_VERSION = 2`.
- Расширить `EncryptedSecret`:
  ```ts
  export type EncryptedSecret =
    | { version: 1; iv: string; ciphertext: string }
    | { version: 2; iv: string; ciphertext: string };
  ```
  (Структура одинаковая, version отличает наличие inner-iv внутри plaintext outer-слоя. Можно даже не менять version, т.к. наличие `passwordParams` на сервере однозначно говорит о двух слоях. Но bump упрощает миграции — оставим.)
- Новая функция `prepareSecretUploadWithPassword(secret, password) → ExtendedPreparedUpload` возвращающая дополнительно `passwordParams`, `passwordVerifierHash`.
- Новая `decryptSecretWithPassword(secretKey, encryptedSecret, password, passwordParams) → string`.
- `isValidEncryptedSecret` должна принимать version 1 и 2 (оба валидны).
- Новые валидаторы: `isValidPasswordParams`, `isValidPasswordVerifierHash` для серверной стороны.

### 4.3 Новый файл `src/lib/password-derive.ts`
Изоляция PBKDF2 через `crypto.subtle.deriveBits` для тестируемости:
- `derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>`
- `computeVerifierHash(K_inner: Uint8Array): Promise<string>`
- Тесты: те же password+salt+iterations всегда дают тот же K_inner; разные пароли — разные ключи.

### 4.4 Новый файл `src/lib/password-policy.ts`
- `MIN_PASSWORD_LENGTH = 8`.
- `MAX_PASSWORD_LENGTH = 256`.
- `isValidPassword(value: string): boolean` (длина, не пустая строка после `trim`).

### 4.5 Изменения в `src/lib/secret-store.ts`
В Hash добавляются поля:
- `passwordSalt` (base64url, может быть пустая строка = no password)
- `passwordIterations` (string number, default `''`)
- `passwordVerifierHash` (base64url, может быть пустая)

`CREATE_SCRIPT` принимает на 3 ARGV больше.

**Связка с этапом 3:** этап 4 НЕ создаёт новый Lua-скрипт, а расширяет уже существующий `OPEN_SCRIPT` из этапа 3 — добавляет вторую constant-time проверку (verifier) перед инкрементом `viewsUsed`. Используем уже отлаженный constant-time-compare паттерн из CONSUME_SCRIPT (тот же цикл сравнения, тот же failed-attempts счётчик).

`OPEN_SCRIPT` теперь сначала validates accessTokenHash (как сейчас), затем — если stored `passwordVerifierHash` непустой — validates переданный verifier через ту же constant-time-compare функцию. Failed на любом → `HINCRBY failedAttempts`, lockout при достижении лимита. Match на обоих → консьюмит view (логика этапа 3).

**Backward-compat для пред-этап-4 секретов:** v1 и пост-этап-3 v2 hashes без password-полей. Lua проверяет:
- `local storedVerifierHash = redis.call('HGET', KEYS[1], 'passwordVerifierHash')` → `false` или пустая строка означает "пароля нет, verifier-проверку пропустить".
- Любое не-пустое значение → требует verifier и валидирует. Если клиент не прислал verifier на password-protected секрет → mismatch (как wrong token).

`getMetadata` дополнительно возвращает `passwordParams: { salt, iterations } | null` (для SSR).

`consume` сигнатура: `consume(id: string, accessTokenHash: string, passwordVerifierHash: string | null) → ConsumedSecret | null`.

### 4.6 API изменения
`POST /api/secrets/route.ts`:
- Body может включать `passwordParams: { salt, iterations }` (опционально) и `passwordVerifierHash` (опционально).
- Валидация: оба или ни одного. Иначе 400.
- `iterations` в разрешённом диапазоне `[100_000, 1_000_000]`.
- `salt` — base64url, фиксированная длина (16 байт = 22 chars base64url без padding).

`POST /api/secrets/[id]/route.ts`:
- Body может включать `passwordVerifier` (base64url).
- Хешируется через `hashAccessToken`-аналог (SHA256 + base64url).
- Передаётся в `secretStore.consume(...)`.

### 4.7 UI изменения

**Создание (`<CreateForm>`):**
- `<PasswordField value={pwd} show={showPwd} onChange={...} onToggleShow={...} />`. Опционально, placeholder из дизайна "leave empty for link-only access".
- При сабмите: если `pwd.length > 0` → `prepareSecretUploadWithPassword`, иначе `prepareSecretUpload`.

**Просмотр (`<LockScreen>`):**
- Если `passwordParams != null` → показывается дополнительный `<PasswordPrompt>` (input + eye toggle + кнопка "Unlock"). Кнопка `Reveal` отключена пока пароль не введён.
- Сообщение об ошибке: поскольку URL-fragment гарантирует корректный accessToken (он детерминированно выводится из ключа в фрагменте на клиенте), 404 на password-protected секрете однозначно означает одно из: (а) неверный пароль, (б) ссылка истекла по TTL, (в) исчерпан lockout (5 неудачных попыток подряд → секрет удалён). Показывать что-то вроде: "Could not unlock — check your password. After 5 wrong attempts the secret is destroyed permanently." 
- Опционально подгрузить через расширенный `getMetadata` поле `failedAttempts` и показать "{5 - failedAttempts} attempts remaining" перед попыткой. Это marginal info-leak, но usability win, и не даёт ничего сверх существующего lockout-механизма.
- После 5 неудачных попыток секрет удалён (как сейчас).

### 4.8 Тесты
- `src/lib/password-derive.test.ts`: PBKDF2 детерминирован, разные параметры → разные ключи.
- `src/lib/secret-crypto.test.ts`: добавить кейсы:
  - `prepareSecretUploadWithPassword + decryptSecretWithPassword` round-trip.
  - Wrong password → AES-GCM auth fail.
  - `isValidEncryptedSecret` принимает v1 и v2.
- `src/lib/secret-store.test.ts`:
  - Создание с password → consume требует verifier.
  - Verifier mismatch → failedAttempts++, не консьюмит view.
  - 5 wrong verifier → секрет удалён.
  - Создание без password → consume без verifier работает (backward compat).
  - Combination: password + maxViews=3 → 3 успешных consume с правильным verifier; на 4-м секрет удалён.
- `src/app/api/secrets/routes.test.ts`: full E2E с password.

### 4.9 Verification (этап 4)
- `npm run check && npm test`.
- Локально: создать с password → URL открывает lock-screen с password input → wrong password 5 раз → секрет недоступен. Right password → reveal с правильным plaintext.
- Проверить combination password + maxViews + format=json → подсветка на revealed экране, корректный счётчик.
- Backward compat: создать v1 секрет (закомитить feature flag перед PR4? нет, проще — создать через старый API на main, deploy nu PR4 → существующий v1 hash должен открыться).
- Security smoke check: сервер не видит `verifier`, только `verifierHash` (через `SHA256(verifier)`); открыть DevTools → проверить что `verifier`, `password`, `K_inner` нигде не отправляются за пределы клиента.

---

## Этап 5 — QR-код для сгенерированной ссылки (PR #5)

**Цель:** на экране `generated` сделать функциональным кнопку "QR code" — позволить отправителю поделиться ссылкой через QR (для офлайн-передачи на чужой телефон, на встречах, на конференциях).

### 5.1 Что хочется

- Клик по кнопке "QR code" в `<GeneratedLink>` открывает компактный inline-блок (или dialog) с QR-кодом, кодирующим ПОЛНУЮ ссылку (включая `#fragment` с ключом).
- Под QR — кнопки "Copy link", "Download SVG", "Download PNG".
- Закрыть QR — крестиком или повторным кликом по кнопке.
- Должно работать на mobile (свайп / тач-области достаточные).
- Никаких сетевых запросов: QR генерируется чисто на клиенте, fragment с ключом никогда не покидает браузер (это инвариант проекта).

### 5.2 Библиотека

- `qrcode` (npm: `qrcode`, ~52KB minified, MIT, синхронный API, есть SVG- и Canvas-рендер).
- Подключается через **dynamic import** (`await import('qrcode')`) в момент клика, чтобы не утяжелять основной бандл главной страницы — большинство пользователей QR не открывают.
- Альтернативы рассмотрены и отклонены: `qrcode.react` (тянет React-обёртку, лишний reflow), `qr-creator` (Canvas-only, без SVG download), серверная генерация (нарушает инвариант — fragment ключа не должен уходить).

### 5.3 Новые файлы

- `src/lib/qr.ts` — тонкая обёртка над `qrcode`:
  - `renderQrSvg(text: string, options?: { errorCorrectionLevel?: 'M' | 'Q' | 'H'; margin?: number; scale?: number }): Promise<string>` — возвращает SVG-строку.
  - `renderQrPngDataUrl(text: string, options?): Promise<string>` — возвращает data URL PNG.
  - Дефолты: errorCorrectionLevel `'M'` (хороший баланс плотности и устойчивости), `margin: 2`, `scale: 8` (для PNG).
  - Все функции — динамический импорт `qrcode` внутри.

- `src/components/secret/qr-modal.tsx` — UI-компонент:
  - Принимает `link: string`, `open: boolean`, `onClose()`.
  - При `open=true` лениво вызывает `renderQrSvg`, показывает SVG в DOM (через `dangerouslySetInnerHTML` — `qrcode` библиотека сама экранирует контент, но дополнительная проверка через TS-обёртку).
  - Кнопки внизу: "Copy link" (через существующий `useClipboardCopy`), "Download SVG", "Download PNG" (через `Blob` + `URL.createObjectURL` + click на скрытом `<a download>`).
  - Тёмная и светлая темы: цвета QR настраиваются — `dark: --fg-default, light: --bg-1` через CSS-переменные. На светлой теме инвертируются.
  - Доступность: dialog с `role="dialog"`, `aria-labelledby`, фокус-trap, Escape закрывает, клик по backdrop закрывает.

### 5.4 Интеграция в `<GeneratedLink>`

`src/components/secret/generated-link.tsx`:
- Добавить state `[qrOpen, setQrOpen] = useState(false)`.
- Кнопка "QR code" из дизайна (`<Icon.QrCode /> {t.generated.qr}`) → `onClick={() => setQrOpen(true)}`.
- Рендер `<QrModal link={fullLink} open={qrOpen} onClose={...} />`.
- `fullLink` — полный URL с fragment (`createSecretLink` уже возвращает абсолютный URL).

### 5.5 i18n
В messages добавить ключи для QR-блока:
- `generated.qr.title` — "Scan to open"
- `generated.qr.subtitle` — "Anyone with this code can open the secret. Treat it as the link."
- `generated.qr.downloadSvg` — "Download SVG"
- `generated.qr.downloadPng` — "Download PNG"
- `generated.qr.close` — "Close"

Перевести на все 7 языков.

### 5.6 Тесты
`src/lib/qr.test.ts`:
- `renderQrSvg("https://example.com")` возвращает строку, начинающуюся с `<svg`.
- `renderQrPngDataUrl(...)` возвращает строку, начинающуюся с `data:image/png;base64,`.
- QR кодирует именно тот текст, что передан (декодируем обратно — пакет `qrcode-reader` или просто строковая проверка длины и того, что в SVG присутствует payload в виде модулей; полная декодировка избыточна для unit-теста).
- Длинные ссылки (full URL с fragment ~100 chars) корректно влезают.

`src/components/secret/qr-modal.test.tsx` (если у нас уже есть RTL setup — иначе пропустить):
- При `open=true` вызывается `renderQrSvg` ровно один раз для одной и той же ссылки.
- Escape закрывает dialog.

### 5.7 Privacy / security проверки
- В DevTools Network tab при открытии QR не должно быть НИ ОДНОГО запроса (всё локально).
- CSP-изменения **не требуются**: SVG рендерим через `dangerouslySetInnerHTML` (inline DOM, не подпадает под `img-src`); PNG скачивается через `<a href="data:image/png;base64,..." download>` (download trigger, не resource fetch). Если в будущем захотим показывать превью PNG через `<img src="data:...">`, тогда добавить `img-src 'self' data:` в `next.config.ts`.
- QR-PNG скачанный пользователем содержит fragment ключа в payload — это нормально, ровно то же, что и буфер обмена. Предупредить в `qr.subtitle` (i18n).

### 5.8 Verification (этап 5)
- `npm run check && npm test`.
- Создать секрет → нажать "QR code" → отсканировать телефоном (любым QR-сканером) → ссылка открывается на телефоне → reveal работает.
- Скачать SVG, открыть в `<img>` или браузере → QR корректно отображается. То же с PNG.
- Тёмная и светлая темы: QR читается в обоих.
- Mobile viewport: dialog не вылазит, кнопки попадаются пальцем.
- Network tab: ноль запросов при открытии QR.
- Lighthouse на главной: бандл не вырос (потому что dynamic import).

---

## Критичные файлы (для всех этапов)

**Не трогать без явной причины:**
- `src/lib/valkey-client.ts` — connection lifecycle.
- `src/lib/rate-limit.ts` — rate-limit логика отдельна.
- `src/lib/http.ts` — IP parsing, JSON reading.
- `next.config.ts` (CSP) — добавить только новые скрипт-источники, если next-intl потребует (он не должен).

**Изменяются на этапах:**
- E1: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`+перенос в `[locale]/`, все компоненты переоформляются.
- E2: `src/components/secret-form.tsx` → удалить, заменить на `src/components/secret/create-form.tsx`. То же для `secret-viewer.tsx`. `src/lib/expiration.ts` — добавить minutes константы.
- E3: `src/lib/secret-store.ts` (CREATE/OPEN scripts), `src/lib/create-secret-link.ts`, `src/app/api/secrets/route.ts`, `src/app/api/secrets/[id]/route.ts`, `src/app/[locale]/s/[id]/page.tsx` (SSR с maxViews).
- E4: `src/lib/secret-crypto.ts`, `src/lib/secret-store.ts`, оба роута, `src/components/secret/lock-screen.tsx`.
- E5: новые `src/lib/qr.ts`, `src/components/secret/qr-modal.tsx`; правка `src/components/secret/generated-link.tsx`.

**Существующие утилиты для переиспользования:**
- `prepareSecretUpload`, `decryptSecret`, `deriveSecretId`, `deriveSecretAccessToken`, `hashAccessToken`, `readSecretKeyFromHash`, `isValidSecretId`, `isValidAccessToken`, `isValidEncryptedSecret` — все остаются.
- `useClipboardCopy`, `CopyButton`, `ToastMessage` из `src/components/copy-button.tsx`.
- `highlight` lazy import из `src/lib/highlight-secret.ts` — переиспользуется в `<SecretTextarea>` и `<RevealedSecret>`.
- `SECRET_FORMATS`, `SECRET_FORMAT_LABELS`, `isSecretFormat` из `src/lib/secret-formats.ts`.
- `MIN/MAX/DEFAULT_EXPIRATION_SECONDS`, `isValidExpirationSeconds` из `src/lib/expiration.ts`.

---

## Открытые риски и решения

1. **next-intl + текущий `proxy.ts` (не middleware) — есть риск конфликта.** Проверить документацию next-intl для App Router 16: поддерживается `middleware.ts`, но мы переехали на `proxy.ts` (commit b609980). Решение: импортировать `createMiddleware` из next-intl и переэкспортировать из `src/proxy.ts`. Если сломается — fallback к `middleware.ts`.

2. **CSP-заголовки могут блокировать next-intl или next-themes.** Проверить `next.config.ts`. Скорее всего не сломается (всё inline или same-origin), но cмotreть в логи.

3. **Backward compatibility v1 → v2 секретов.** На этапе 4 в продакшене могут жить v1 секреты (TTL до 30 дней). `decryptSecretWithPassword` должен fallback на `decryptSecret` для v1 (т.е. без password). `getMetadata` для v1 секретов возвращает `passwordParams: null` → `LockScreen` рисует обычный flow.

4. **Перевод 7 языков из `new_design/i18n.jsx` — большой объём текста.** Тексты для новых ключей (`maxViews`, `password`, errors после 4-го этапа) будут добавляться по мере добавления фич. На этапе 1 нужны переводы только под уже существующие тексты + nav/header/footer.

5. **Раскрытие `passwordParams` через metadata route — это SEO-OK или leak?** `getMetadata` уже доступен через SSR (server-to-Valkey), наружу не идёт. На клиент `passwordParams` нужен после SSR-рендера — это публично видно в HTML (как props для viewer client component). `salt`+`iterations` не секретны. Brute-force защищён `failedAttempts` + lockout. OK.

6. **i18n-индексация поисковиками `/s/[id]` страниц.** В `robots.ts` запретить `/*/s/*`. Установить `<meta name="robots" content="noindex, nofollow">` в metadata страницы viewer.

---

## Выходной чеклист всей миграции

- [ ] 5 PR сменили друг друга, каждый зелёный.
- [ ] Все 7 локалей переключаются и SSR-рендерятся.
- [ ] Тёмная и светлая темы работают, persist в localStorage.
- [ ] Минимальный SEO-каркас на 4 stub-страницах × 7 locales.
- [ ] Lighthouse: SEO 100, A11y 100, Best Practices 100.
- [ ] highlight.js работает на create + reveal для всех 14 форматов.
- [ ] minutes/hours/days в TTL.
- [ ] maxViews [1, 3, 5, 10, ∞] работает, brute-force lockout цел.
- [ ] password опциональный, двойное шифрование, verifier защищает от траты views на wrong password.
- [ ] Backward compat: v1 секреты раскрываются как раньше.
- [ ] QR-код генерируется на клиенте, скачивается SVG/PNG, не делает сетевых запросов.
- [ ] Tests cover crypto round-trip, store consume cycles, API E2E, QR rendering.
- [ ] CSP не нарушен.
- [ ] Sitemap.xml и robots.txt корректные.

# План: разбивка стилей на per-component CSS Modules

## Контекст

Сейчас весь UI стилизован одним файлом `src/app/globals.css` (**2705 строк**): обычный
CSS, плоские BEM-подобные классы (`.nav`, `.card`, `.btn`, `.field`, `.link-box`…),
компоненты применяют их строками — `className="card"`. Файл импортируется в двух
layout'ах (`src/app/[locale]/layout.tsx`, `src/app/s/layout.tsx`). Tailwind / PostCSS-плагинов /
CSS Modules / `clsx` в проекте нет.

Внутри `globals.css` уже фактически живут три слоя, просто слитые вместе:

1. **Токены дизайн-системы** — `:root` (цвета, тип-шкала, радиусы, тени, градиенты) и
   dark-overrides (~строки 1–199).
2. **Общие примитивы** — переиспользуются многими компонентами:
   `.btn` (8 компонентов), `.card` (6), `.field` (5), `.banner` (4), `.fade-up` (5),
   `.segmented` (2), `.eyebrow`/`.lede` (типографика, в т.ч. в `app/`-страницах).
3. **Стили конкретных компонентов** — `.qr-modal`, `.lang-picker`, `.format-select`,
   `.foot`, `.lifecycle`, `.secret-output` и т.д.

## Цель

- `globals.css` = **только дизайн-система**: `:root` токены, dark-overrides, base reset,
  глобальные утилиты и keyframes.
- У каждого компонента — **свой co-located файл стилей** (`*.module.css` рядом с `.tsx`).
- Общие примитивы — в `src/styles/primitives/*.module.css`, переиспользуются через `composes`.

## Принятые решения

- **Технология — CSS Modules (`*.module.css`).** Встроены в Next.js (ноль новых
  зависимостей), автоскоупинг хеш-классами убирает коллизии, статическое извлечение на
  билде, минимальный диф (`className="card"` → `className={styles.card}`), токены остаются
  глобальными CSS-переменными — темизация не ломается.
- **Общие примитивы — composable-модули.** `primitives/button.module.css` и т.д.;
  компоненты переиспользуют через `composes`. Меньше дифа, строковые className убираются
  постепенно. (Альтернатива — поднять до `<Button>/<Card>` React-компонентов — отклонена
  как слишком большой одномоментный диф.)
- **Имена классов — camelCase везде.** В файлах стилей `.someButton`, в коде
  `styles.someButton`. Ноль конфига, dot-доступ, Turbopack остаётся. (Рантайм-обёртки и
  webpack-патч `exportLocalsConvention` отклонены — см. «Соглашение об именах классов».)

> Главный выигрыш — **изоляция и поддерживаемость**, а не перф. Глобальный CSS Next бандлит
> один раз; перф-эффект скромный (dead-code elimination при code-split, ср. правило
> `bundle-analyzable-paths`).

## Целевая структура

```
src/
├─ app/
│  └─ globals.css            ← ТОЛЬКО токены, dark-overrides, base reset, утилиты, keyframes
├─ styles/
│  ├─ tokens.css             ← (опц.) :root отдельно; globals.css его @import'ит
│  └─ primitives/
│     ├─ button.module.css   (.btn, .btnPrimary, .btnSecondary, .btnGhost, .btnDanger, .btnIcon…)
│     ├─ card.module.css     (.card, .cardHeader, .cardBody, .cardFooter, .cardInfo…)
│     ├─ field.module.css    (.field, .input, .hint, .error, feedback)
│     ├─ banner.module.css   (.banner, .bannerWarn, .bannerSuccess, .bannerDanger)
│     └─ controls.module.css (.segmented, .stepper, .pill)
└─ components/
   ├─ layout/
   │  ├─ site-header.tsx  + site-header.module.css
   │  ├─ site-footer.tsx  + site-footer.module.css
   │  ├─ lang-picker.tsx  + lang-picker.module.css
   │  └─ theme-switch.tsx + theme-switch.module.css
   └─ secret/
      ├─ qr-modal.tsx        + qr-modal.module.css
      ├─ format-select.tsx   + format-select.module.css
      ├─ generated-link.tsx  + generated-link.module.css
      ├─ lock-screen.tsx     + lock-screen.module.css
      ├─ revealed-secret.tsx + revealed-secret.module.css
      ├─ secret-textarea.tsx + secret-textarea.module.css
      ├─ create-form.tsx     + create-form.module.css
      ├─ password-field.tsx  + password-field.module.css
      ├─ lifecycle-steps.tsx + lifecycle-steps.module.css
      └─ …
```

Обернуть глобальный слой в **CSS cascade layers**, чтобы порядок каскада не зависел от
порядка импортов:

```css
@layer tokens, base, primitives, components;
```

## Что остаётся в `globals.css` (дизайн-система)

| Блок | Строки (≈) | Назначение |
|---|---|---|
| `:root` светлые токены | 1–64 | цвета, тип-шкала, радиусы, тени, градиенты, отступы |
| dark-overrides `:root:not([data-theme="light"])` | 65–199 | переменные тёмной темы |
| base reset (`*`, `html`, `body`) + фон, `.bg-grid` | 217–228 | базовый сброс, фон страницы |
| глобальные утилиты `.visually-hidden`, `.page`/`.page-wide` | 205, 357 | используются и в `app/`-страницах |
| глобальные keyframes `.fade-up`, `.flame`, `drop-overlay-in`, спиннеры | 2218–2261 и др. | общие анимации |
| `prefers-reduced-motion` | 2410–2421 | глобальная доступность |

`next-themes` ставит `[data-theme]`/класс на `<html>` — остаётся глобальным.
highlight.js `github.css` (импорт в `src/lib/highlight-secret.ts`) — сторонний глобальный
(`.hljs`), не трогаем.

## Карта «секция CSS → назначение»

| Секция в globals.css | Строки (≈) | Куда |
|---|---|---|
| `.nav*`, `.brand*` (+ dark 242) | 230–327 | `site-header.module.css` |
| `.theme-switch*` | 329–393 | `theme-switch.module.css` (`.visually-hidden` оставить глобально) |
| `.lang-picker*` | 395–459 | `lang-picker.module.css` |
| `.eyebrow`, `.lede` | 461–511 | примитив типографики (исп. и в `app/`-страницах) |
| `.card*` | 513–603 | `primitives/card.module.css` |
| `.file-info*`, `.drop-overlay*`, `.attachment*` | 605–810 | `create-form` / `secret-textarea` |
| `.field*`, `.input*`, `.textarea*`, toolbar | 812–1067 | `primitives/field` + `secret-textarea.module.css` |
| `.btn*` | 1070–1200 | `primitives/button.module.css` |
| `.segmented`, `.stepper` | 1202–1290 | `primitives/controls` (ttl/max-views) |
| `.lifecycle*`, `.screen-tabs*` | 1292–1390 | `lifecycle-steps.module.css` |
| `.format-select*` | 1392–1500 | `format-select.module.css` |
| `.pill*` | 1502–1532 | `primitives/controls` (lock-screen) |
| `.link-box*`, `.stats`, `.stat*` | 1534–1713 | `generated-link.module.css` |
| `.reveal-card`, `.lock-icon`, `.countdown*` | 1714–1811 | `lock-screen.module.css` / reveal |
| `.secret-output*` | 1812–1873 | `revealed-secret.module.css` |
| `.banner*`, `.own-secret-banner` | 1874–1930 | `primitives/banner.module.css` |
| `.foot*`, `.status-dot` | 1932–1989 | `site-footer.module.css` |
| `.features`, `.feature-row*` | 1991–2028 | landing / `create-intro` |
| `.toast*`, `.info-popover*` | 2030–2126 | **0 использований в компонентах — проверить и, возможно, удалить** |
| `.error`, `.hint*` | 2127–2150 | `primitives/field` (feedback) |
| `.field-label-hint`, `.password*` | 2151–2201 | `password-field.module.css` |
| `.viewer-actions*` | 2203–2216 | `viewer.module.css` |
| `.qr-modal*` | 2263–2407 | `qr-modal.module.css` |
| responsive `@media (max-width)` | 2425–конец | **распределить** по соответствующим модулям |

## Механика конвертации

1. **Имена классов.** kebab в CSS ↔ доступ в JS — отдельная тема с нюансом Turbopack;
   см. раздел «Соглашение об именах классов» ниже.
2. **Переиспользование примитивов через `composes`:**
   ```css
   /* generated-link.module.css */
   .submit {
       composes: btn btnPrimary from '@/styles/primitives/button.module.css';
   }
   ```
   Доступ в JSX — `className={styles.submit}`.
3. **Dark-overrides** вида `:root:not([data-theme="light"]) .nav` (строка 242): в модуле
   обернуть глобальную часть — `:global(:root:not([data-theme='light'])) .nav { … }`. **Лучше**,
   где возможно, заменить на CSS-переменную, которая уже флипается в токенах (тогда оверрайд
   не нужен).
4. **Кросс-компонентные селекторы.** Есть правила, где примитив «лезет» в другой
   (`.card-footer .btn-primary[type="submit"]`, строка 573). Их нужно осознанно поселить в
   «владеющем» слое или отрефакторить, иначе после разбивки они потеряются.
5. **Keyframes** в модуле скоупятся (переименовываются). Общие (`fade-up`, `flame`) — оставить
   в globals; локальные — можно в модуль.
6. **Тесты.** Vitest/jsdom CSS игнорирует, но если тест ищет по `.className` — хеширование
   модулей это сломает. Перед стартом — grep тестов на селекторы по классам.
7. **Biome.** Убедиться, что `npm run check` корректно обрабатывает `*.module.css`.

## Соглашение об именах классов (kebab в CSS ↔ camelCase в JS)

**Вопрос:** писать в CSS `.some-button`, а в JS обращаться `styles.someButton`.

**Короткий ответ для этого проекта (Next 16 + Turbopack): нативно так не получится.**

Почему:

- За преобразование отвечает опция `css-loader` `exportLocalsConvention` (старое имя
  `localsConvention`). Значение `'camelCase'` экспортирует класс И как `styles['some-button']`,
  И как `styles.someButton`; `'camelCaseOnly'` — только camelCase.
- Next.js **не пробрасывает** эту опцию официально. Для webpack есть community-патч (правка
  правила css-loader в `next.config`), который «works like a charm», но это неофициально
  (vercel/next.js#11267, открыт ~5 лет).
- Проект на **Turbopack** (дефолт Next 16 и для `dev`, и для `build`; `next.config.ts` уже
  заточен под него — MDX-плагины serializable). Turbopack обрабатывает CSS-модули нативно
  (тип `css-module`), `css-loader` в его пайплайн вставить нельзя (Turbopack не поддерживает
  loader'ы, трансформирующие стили), а в конфиге `turbopack` опций naming-convention нет —
  только `root` / `rules` / `resolveAlias` / `resolveExtensions` / `debugIds`. Значит
  webpack-патч под Turbopack не применится.

**Реальные варианты:**

| # | В CSS | Доступ в JS | Конфиг | Turbopack | Комментарий |
|---|---|---|---|---|---|
| 1 | `.some-button` (kebab) | `styles['some-button']` | нет | ✅ | kebab в CSS сохранён, доступ через скобки |
| 2 | `.someButton` (camelCase) | `styles.someButton` | нет | ✅ | единая нотация, но в CSS не kebab |
| 3 | `.some-button` (kebab) | `styles.someButton` **и** `['some-button']` | webpack-патч `exportLocalsConvention:'camelCase'` | ❌ только на `--webpack` | даёт ровно желаемое, ценой отказа от Turbopack |

**Решение (зафиксировано): вариант 2** — camelCase в CSS (`.someButton`), доступ
`styles.someButton`. Единая dot-нотация, ноль конфига, Turbopack остаётся. (Вариант 1 —
kebab + bracket; вариант 3 — webpack-патч; рантайм-обёртка `cx()` — все отклонены: рантайм
не нужен, dot-доступ важнее kebab в файлах стилей.)

> Источники: [vercel/next.js#11267](https://github.com/vercel/next.js/discussions/11267),
> [Turbopack config](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack),
> [css-loader `exportLocalsConvention`](https://webpack.js.org/loaders/css-loader/#exportlocalsconvention).
> При желании можно за ~2 минуты эмпирически проверить дефолт Turbopack (тестовый
> `.module.css` + лог импортированного объекта на `next dev`); по докам camelCase он не
> экспортирует.

## Поэтапный rollout (приложение рабочее на каждом шаге)

- **Фаза 0 — каркас.** Создать `src/styles/primitives/`. **Токены остаются в `globals.css`** —
  это и есть будущий «globals = дизайн-система»; правила компонентов покидают `globals.css`
  по мере конверсии. `@layer` на старте не нужен (модули скоупятся хешем, токены — переменные;
  ввести позже, если понадобится порядок каскада). Модули — `*.module.css` рядом с компонентом,
  classNames переходят на `styles.x`. **Визуально 0 изменений.**
- **Фаза 1 — листовые компоненты → модули** (по одному; начать с самодостаточных, без общих
  примитивов): `qr-modal`, `lang-picker`, `format-select`, `site-footer`, `theme-switch`,
  `lifecycle-steps`. Каждый PR = один компонент.
- **Фаза 2 — компоненты с примитивами** (`generated-link`, `lock-screen`, `revealed-secret`,
  `create-form`, `password-field`, `secret-textarea`) через `composes`.
- **Фаза 3 — финализация примитивов.** Привести `primitives/*` к единому виду, убрать
  оставшиеся строковые className на примитивах.
- **Фаза 4 — чистка.** Удалить мёртвый CSS (`toast`/`info-popover`, если правда не
  используются). Финал: `globals.css` = только токены + base + утилиты.

## Проверка на каждой фазе

1. `npm run check` (Biome)
2. `npm test` (Vitest)
3. `npm run build` (standalone-сборка)
4. Визуальный диф ключевых экранов в **light/dark**: create-форма, generated-link, viewer/lock,
   qr-modal, docs/security страницы.

## Риски и подводные камни

- **Порядок каскада** меняется при разбивке — решается `@layer`.
- **Кросс-компонентные селекторы** (примитив → дочерний класс другого компонента) теряются,
  если не пересажены осознанно.
- **Общие keyframes**: ссылки `animation: fade-up …` требуют, чтобы keyframe оставался
  глобальным.
- **Dark-overrides** через `:global()` или вариабилизацию.
- **Тесты по className** ломаются от хеширования — проверить заранее.
- **Мёртвый CSS** (`toast`, `info-popover`) — подтвердить, что не используется в `app/`/MDX,
  прежде чем удалять.

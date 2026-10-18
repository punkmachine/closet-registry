# TODO: вынос UI-примитивов в `@closet/ui`

Цель: убрать копипасту стилей и разметки из `apps/admin-panel` и собрать «тупые» (presentational) компоненты
в `packages/ui`. Компоненты без логики и без Nuxt-зависимостей: пропсы + слоты + `v-model`, стили `<style scoped>`.

## Что нашёл (масштаб дублирования)

Каждый компонент/страница админки сейчас объявляет свои копии классов в `<style scoped>`:

| Примитив         | Сколько файлов дублирует                                                                                                                                                                                       | Замечания                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.btn` (+ варианты) | 14: `PluginForm`, `AccountPasswordPanel`, `AccountTokenPanel`, `PasswordField`, `UserCreateForm`, `UserResetPasswordDialog`, `UsersTable`, `layouts/default`, `pages/{index,login,admin/audit,admin/users,plugins/[slug]/index}`, `ConfirmDialog` | Версии расходятся: где-то без `inline-flex`/`gap`/hover, где-то `padding` 7/8px, `font-size` 12/13px; `btn` в `login`/`UserCreateForm` фактически primary |
| `.alert`         | 12: `PluginForm`, `AccountPasswordPanel`, `AccountTokenPanel`, `UserCreateForm`, `UserResetPasswordDialog`, `pages/{account,admin/audit,admin/users,index,login,plugins/[slug]/edit,plugins/[slug]/index}`       | В большинстве — копия `error`-варианта без модификатора                                                                                            |
| `.badge`         | 10: `PluginForm`, `UsersTable`, `UserStatusBadge`, `layouts/default`, `pages/{account,index,plugins/[slug]/index}`, `ComponentBadge`, `FileBrowser`, `PluginCard`                                               | Уже в ui дублируется между `ComponentBadge`/`FileBrowser`/`PluginCard`                                                                             |
| `.input`         | 6: `PasswordField`, `PluginForm`, `UserCreateForm`, `pages/{index,login}`, `ConfirmDialog`                                                                                                                     | `login` добавляет `font-family: mono` прямо в базовый класс                                                                                        |
| `.field`/`__label` | 5: `PasswordField`, `PluginForm`, `UserCreateForm`, `pages/login`, `ConfirmDialog`                                                                                                                           |                                                                                                                                                    |
| `.spinner` / `.state` | 5: `PluginForm`, `pages/{index,plugins/[slug]/edit,plugins/[slug]/index}`, `ConfirmDialog`, `FileBrowser`                                                                                                 | `@keyframes spin` продублирован в каждом                                                                                                           |
| `.panel`         | 4: `AppPanel` (в админке), `PluginForm`, `pages/plugins/[slug]/index`, `FileBrowser`                                                                                                                           | `AppPanel` — по сути уже primitive, лежит не там                                                                                                   |
| `.page-head` (+ `__text`, `__sub`) | 7: все страницы                                                                                                                                                                              |                                                                                                                                                    |
| `.breadcrumbs`   | 3: `plugins/new`, `plugins/[slug]/edit`, `plugins/[slug]/index`                                                                                                                                                |                                                                                                                                                    |
| `.table`         | 2: `UsersTable`, `AuditTable`                                                                                                                                                                                  |                                                                                                                                                    |
| `.meta-list`     | 3: `AccountTokenPanel`, `plugins/[slug]/index`, `FileBrowser`                                                                                                                                                  |                                                                                                                                                    |
| `.modal`         | 2: `UserResetPasswordDialog`, `ConfirmDialog`                                                                                                                                                                  | Backdrop/modal-каркас скопирован                                                                                                                   |
| `.select`, `.textarea`, `.checkbox` | только `PluginForm` (+ `select` в `UsersTable`)                                                                                                                                             | Нужны как примитивы, пока живут по одному разу                                                                                                     |

Хардкод цветов вместо токенов, повторяется по всем файлам: `#6e2b28` (×17, border danger), `#ffb3ab` (×14, text danger),
`#1b1008` (×12, text on accent), `#ff8a80` (×6), `#e6edf3` (×23, заголовки), `#ffffff26` (×5), `#4a525c`, `#7a4232`, `#3f5a3f`
и др. Их надо завести как токены в `tokens.css`.

## Подготовка

- [ ] Добавить недостающие токены в `packages/ui/src/tokens.css`:
  - `--danger-border` (`#6e2b28`), `--danger-text` (`#ffb3ab`), `--danger-text-strong` (`#ff8a80`), `--danger-bg-hover` (`#f8514933`)
  - `--on-accent` (`#1b1008`), `--text-strong` (`#e6edf3`)
  - `--focus-ring` (то, что сейчас рисуется в `:focus` у `.input`), `--overlay` (фон backdrop), `--spinner-track` (`#ffffff26`)
  - success/warn border-токены (`#3f5a3f`, `#6d541f` и т.п. — сверить, где реально используются)
- [ ] Решить схему экспорта: оставить `index.ts` как есть + добавлять компоненты по одному; `tokens.css`/`utilities.css` подключаются
      админкой как сейчас. Новый глобальный `.css` не заводить (в CLAUDE.md закреплено: только tokens/utilities/main) — всё в scoped.
- [ ] Именование: префикс не нужен (как у `ComponentBadge`), но не конфликтовать с Nuxt-автоимпортом — папку ui подключать явно.
- [ ] Папки: `packages/ui/src/components/` оставить плоской или завести `primitives/`? (предложение: `primitives/` для новых, чтобы
      отличать от доменных `PluginCard`/`FileBrowser`).

## Примитивы (по приоритету)

### 1. `UiButton` (самый частый дубль, 14 файлов)

- [ ] Пропсы: `variant: 'default' | 'primary' | 'danger' | 'ghost'`, `size: 'md' | 'sm'`, `loading`, `disabled`, `type` (по умолчанию `button`),
      `as` (для `NuxtLink`/`a`, как у `PluginCard`) — в нём `block`/`full-width` если нужен для `login`
- [ ] Слоты: default, `icon-left`/`icon-right` (опционально)
- [ ] Встроенный спиннер при `loading` (использует `UiSpinner`)
- [ ] Заменить во всех 14 местах; убрать расхождения (padding/font-size) — свести к двум размерам
- [ ] Вынести `.btn--sm`-стили из `layouts/default`, `pages/index`, `plugins/[slug]/index`, `AccountTokenPanel`, `pages/admin/users`

### 2. `UiAlert`

- [ ] Пропсы: `variant: 'error' | 'info' | 'success' | 'warning'` (по умолчанию `error`), `role="alert"` для error
- [ ] Слот default (+ опционально `action`)
- [ ] Заменить 12 копий; `AccountTokenPanel` использует `--ok`, `PluginForm` — `--info`

### 3. `UiBadge`

- [ ] Пропсы: `variant: 'default' | 'muted' | 'accent' | 'ok' | 'warn' | 'danger' | 'version'`
- [ ] `ComponentBadge` и `UserStatusBadge` переписать поверх `UiBadge` (цвета компонентов `mcp/rules/…` остаются в `ComponentBadge`)
- [ ] Убрать копии из `PluginCard`, `FileBrowser`, `layouts/default`, `UsersTable`, `pages/{account,index,plugins/[slug]/index}`, `PluginForm`

### 4. Формы: `UiInput`, `UiTextarea`, `UiSelect`, `UiCheckbox`, `UiField`

- [ ] `UiInput`: `v-model`, `type`, `mono`, `invalid`, `disabled`, прокидывать остальные attrs на `<input>` (`inheritAttrs`/`v-bind="$attrs"`)
- [ ] `UiTextarea`: `v-model`, `mono`, `rows`/`resize`
- [ ] `UiSelect`: `v-model`, `options` или слот; перенести кастомную стрелку из `PluginForm`
- [ ] `UiCheckbox`: `v-model`, подпись в слоте
- [ ] `UiField`: обёртка `label` + `hint` + `error` + слот для контрола (заменяет `.field`/`.field__label`/`.field__hint` в 5 файлах)
- [ ] `PasswordField` собрать из `UiField` + `UiInput` + `UiButton` (остаётся в админке из-за `password.ts` и генератора)
- [ ] `UiSearchInput` (иконка + input из `pages/index`) — по желанию, после `UiInput`
- [ ] Свести `login.vue`/`UserCreateForm.vue`/`pages/index.vue`/`PluginForm.vue` на эти компоненты

### 5. `UiSpinner` + `UiState` (loading/empty)

- [ ] `UiSpinner`: `size`; `@keyframes spin` объявлен один раз
- [ ] `UiState`: слоты `icon`/`title`/default; режимы `loading` (со спиннером) / `empty` / `error`
- [ ] Заменить блоки `.state` в `pages/index`, `plugins/[slug]/index`, `plugins/[slug]/edit`, `PluginForm`, `FileBrowser`

### 6. `UiPanel` / `UiCard`

- [ ] `UiPanel`: перенести `AppPanel` (админка) в ui; слоты `head`/default, пропсы `title`, `flush`
- [ ] Использовать в `PluginForm`, `plugins/[slug]/index`, `FileBrowser` (убрать `.panel`, `.panel__head`, `.panel__body*`)
- [ ] `UiCard` (базовая карточка: `card-bg`, border, radius, hover, опционально ссылка через `as`) — основа для `PluginCard`
- [ ] Переписать `PluginCard` поверх `UiCard`

### 7. Модалки: `UiModal`

- [ ] Каркас: Teleport + backdrop + `dialog`, закрытие по клику на backdrop и `Esc`, слоты `title`/default/`footer`, проп `open`, эмит `close`
- [ ] Переписать `ConfirmDialog` и `UserResetPasswordDialog` поверх `UiModal`
- [ ] A11y: `aria-modal`, фокус в диалоге, возврат фокуса (проверить, что сейчас нет)

### 8. Таблица: `UiTable`

- [ ] Базовая стилизация `table`/`th`/`td` (слоты `head`/default или просто scoped-класс-обёртка с `:deep`)
- [ ] Использовать в `UsersTable`, `AuditTable`

### 9. Каркас страницы

- [ ] `UiPageHead`: слоты `title`/`subtitle`/`actions` (7 страниц)
- [ ] `UiBreadcrumbs`: проп `items: { label, to? }[]`, рендер ссылок через `as`/слот (3 страницы)
- [ ] `UiMetaList` (`dl`/`dt`/`dd` из `AccountTokenPanel`, `plugins/[slug]/index`, `FileBrowser`): проп `items` или слоты
- [ ] `UiDot` (статус-точка из `layouts/default`) — возможно часть `UiBadge`

### 10. Мелочи (после основного)

- [ ] `UiCopyButton` (`use-clipboard` + «Скопировано» из `PasswordField`/`AccountTokenPanel`) — только если логику можно оставить в composable админки
- [ ] `UiCode`/`UiKbd` для `<code>`-вставок в тексте, если повторяется

## Правила при выносе

- Компоненты в ui — без Nuxt-автоимпортов (`ref`, `computed`, `watch` импортировать из `vue`, как в `ConfirmDialog`), без `useRoute`/`NuxtLink`.
  Ссылки — через проп `as`.
- Цвета только из токенов, никаких `#hex` в компонентах.
- Каждый примитив — один файл `.vue` с `<style scoped>`; глобальных стилей не добавлять.
- Экспортировать в `packages/ui/src/index.ts`.
- Выносить по одному примитиву: сделать компонент → заменить во всех местах → удалить старые scoped-стили → `pnpm typecheck` + `pnpm lint` + `pnpm test`.
- `.vue` не линтится ESLint (см. CLAUDE.md), поэтому после замены проверять руками в браузере: страницы `index`, `login`, `account`,
  `admin/users`, `admin/audit`, `plugins/new`, `plugins/[slug]`, `plugins/[slug]/edit`.
- Добавить vitest-тесты на примитивы в `packages/ui` (пропсы → классы, `v-model`, слоты, `loading`/`disabled`); в админке есть тесты компонентов
  (`tests/components/PasswordField.test.ts`) — взять оттуда настройку как образец.
- После выноса обновить раздел `@closet/ui` в `CLAUDE.md` (список компонентов, правило «общие куски намеренно продублированы» больше не верно).

## Не выносить

- `PluginForm` (завязан на `utils/plugin-files.ts` и Nuxt), `UsersTable`, `AuditTable`, `UserCreateForm`, `UserResetPasswordDialog`,
  `Account*Panel`, `layouts/*` — доменные, остаются в админке, но собираются из примитивов.
- `PluginCard`, `FileBrowser`, `ConfirmDialog`, `ComponentBadge` остаются в ui как есть по назначению, но переезжают на примитивы.

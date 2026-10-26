# Roadmap

Что планируется в `closet-registry` и `closet-cli`.

## 1. CI и релизы

Настройка CI в GitHub: автоматические проверки на каждый коммит и pull request, сборка и публикация релизов по тегам.

## 2. Публичный сайт с документацией

Статический сайт с документацией по `closet-cli` и `closet-registry`.

## 3. Поддержка всех harness и AI IDE

`closet-cli` должен уметь устанавливать плагины во все перечисленные ниже harness и AI IDE.
Список актуален на 2026-10-26, перед реализацией сверить с актуальным. В скобках — идентификатор harness.

- **Уже поддерживаются в closet-cli:** Claude Code (`claude-code`), Codex (`codex`).
- **IDE и редакторы:** Cursor (`cursor`), Windsurf (`windsurf`), Antigravity (`antigravity`),
  Trae (`trae`), Zed (`zed`), Kiro CLI (`kiro-cli`), Junie (`junie`),
  Qoder (`qoder`), Lingma (`lingma`), CodeBuddy (`codebuddy`),
  Code Studio (`codestudio`), CodeArts Agent (`codearts-agent`), Codemaker (`codemaker`),
  Firebender (`firebender`), Replit (`replit`), Warp (`warp`), Zencoder (`zencoder`),
  Zenflow (`zenflow`).
- **Расширения для IDE и агенты в редакторе:** GitHub Copilot (`github-copilot`), Cline (`cline`),
  Roo Code (`roo`), Kilo Code (`kilo`), Continue (`continue`), Augment (`augment`),
  Tabnine CLI (`tabnine-cli`), Rovo Dev (`rovodev`), IBM Bob (`bob`), Pochi (`pochi`),
  Posit Assistant (`posit-assistant`), Ona (`ona`).
- **CLI-агенты:** Antigravity CLI (`antigravity-cli`), Gemini CLI (`gemini-cli`), Grok Build (`grok`),
  Kimi Code CLI (`kimi-code-cli`), Qwen Code (`qwen-code`), OpenCode (`opencode`), Amp (`amp`),
  Goose (`goose`), Droid (`droid`), Crush (`crush`), OpenHands (`openhands`),
  Mistral Vibe (`mistral-vibe`), MiniMax Code (`minimax-code`), iFlow CLI (`iflow-cli`),
  Command Code (`command-code`), Cortex Code (`cortex`), Devin for Terminal (`devin`),
  Autohand Code CLI (`autohand-code`), ForgeCode (`forgecode`), Neovate (`neovate`), Kode (`kode`),
  Pi (`pi`), Sarvam Code (`sarvam-code`), Hermes Agent (`hermes-agent`), OpenClaw (`openclaw`),
  Deep Agents (`deepagents`), Reasonix (`reasonix`), Kimchi (`kimchi`), Jazz (`jazz`), Eve (`eve`),
  Loaf (`loaf`), Mux (`mux`), Moxby (`moxby`), Terramind (`terramind`), Tinycloud (`tinycloud`),
  ZCode (`zcode`), Dexto (`dexto`), fx (`fx`), AdaL (`adal`).
- **Прочие и платформы:** AiderDesk (`aider-desk`), AstrBot (`astrbot`), inference.sh (`inference-sh`),
  MCPJam (`mcpjam`), PromptScript (`promptscript`).
- **Универсальный вариант:** Universal (`universal`) — общая директория `.agents/skills` для
  harness без собственного адаптера.

Для каждого harness нужно описать: куда класть файлы по компонентам (`mcp`/`rules`/`hooks`/`agents`/
`commands`/`skills`/`scripts`), какие компоненты он вообще поддерживает, формат конфигов и
глобальную/проектную установку. Названия папок и форматы брать из официальной документации
конкретного harness, а не придумывать.

Каркас уже есть. Файлы плагинов `closet-cli` пишет в хранилище `.agents/` и копирует в папки harness'ов
по дескрипторам (`closet-cli/src/harnesses/`), а реестр умеет разворачивать универсальный агент
в файлы под каждый harness. Чтобы добавить harness:

1. `closet-registry`: id в `HARNESS_IDS` и строка в матрице `HARNESS_SUPPORT` (`@closet/contract`);
   если формат агентов отличается — рендерер в `@closet/harness-render`. Админка подхватывает чекбоксы целей сама.
2. `closet-cli`: файл-дескриптор `src/harnesses/<id>.ts` и строка в `registry.ts`.

Известные ограничения: старый `closet-cli` с закрытым списком harness'ов пропускает файлы незнакомого
`ai` с предупреждением «обновите closet-cli»; списки harness'ов в CLI и в контракте дублируются намеренно —
нужен скрипт сверки; `rules` для Codex (фрагмент `AGENTS.md`) пока не реализованы.

## 4. MCP-сервер реестра

MCP-сервер для `closet-registry`: поиск плагинов, чтение метаданных и версий, установка
из агента напрямую (инструменты вроде `search`, `get_plugin`, `install`). Авторизация — тем же
персональным API-токеном `clt_…`.

## 5. Плагин для VS Code

Просмотр и поиск плагинов реестра, установка и обновление из IDE, вход по API-токену.

## 6. Плагин для JetBrains IDE

То же самое для IntelliJ-платформы (IDEA, WebStorm, PyCharm и др.).

## 7. `closet-cli find` — рекомендации для проекта

Команда `closet-cli find` анализирует текущий проект (стек, зависимости из `package.json`,
`pyproject.toml`, `go.mod` и т. п., конфиги фреймворков, уже установленные плагины) и выдаёт список
рекомендуемых скиллов и плагинов из реестра.

- Вывод: имя, `slug`, краткое описание, причина рекомендации (какой признак проекта совпал),
  команда установки. Уже установленные помечаются.
- Опции: `--json`, фильтр по компоненту и по harness, установка выбранных прямо из выдачи.
- На стороне реестра нужны теги/ключевые слова плагинов (технологии, фреймворки), по которым
  идёт сопоставление, и эндпоинт поиска/рекомендаций (возможно, расширение `GET /v1/plugins`).

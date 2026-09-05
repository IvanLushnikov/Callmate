# Промпт: верификация PRD × архитектура × функционал × дизайн

Скопируй всё содержимое блока ниже (от `---START---` до `---END---`) в новый чат Cursor.

**Репозитории:**
- **Scorix** (этот) — UI кабинета, тонкий клиент публичного API
- **New** (штаб) — PRD, контракты API, бэклог, handoff-пакеты, архитектура бэка

---START---

# Задача: верификация продукта и закрытие дыр

Ты — продуктовый инженер Scorix. Нужно **сверить PRD с архитектурой, реализованным функционалом (FE + API) и дизайном**, зафиксировать расхождения и **закрыть дыры** — кодом, handoff-задачами или явным «out of scope».

**Принцип:** UI не выдумываем. Если в PRD есть фича без handoff — сначала gap в документации, потом реализация.

---

## Фаза 0. Гигиена git (обязательно до сверки)

1. `git fetch origin main`
2. Открытые PR/MR:
   ```bash
   gh pr list --state open --json number,title,headRefName,isDraft,mergeable
   ```
3. Для каждого открытого PR:
   - прочитать diff и CI;
   - если mergeable и не конфликтует с main — слить (`gh pr merge <N> --merge`);
   - draft с готовым кодом — `gh pr ready <N>` и слить;
   - устаревший/дубль — закрыть с комментарием, почему.
4. Ветки `cursor/*` с коммитами впереди main, но сильно позади — **не мержить слепо**; сверить, не попало ли уже в main через другой PR.
5. Локально: `git checkout main && git pull origin main`.
6. Зафиксировать в отчёте: какие PR слили, какие закрыли, что осталось открытым.

**Стоп-критерий фазы 0:** `main` актуален, нет «висящих» mergeable PR с продуктовым кодом.

---

## Фаза 1. Собрать источники правды

### 1.1 PRD и бэклог (репозиторий New)

| Что | Где искать |
|-----|------------|
| PRD / user stories | `docs/prd/`, `docs/backlog/` |
| Контракты Public API | `docs/api/`, OpenAPI если есть |
| Архитектура бэка | `docs/architecture/`, ADR |
| Handoff для FE | `docs/handoff/fe/<ID>.md` |

Для каждой фичи из PRD выпиши: **ID**, **краткое описание**, **приоритет**, **зависимости**, **критерии приёмки**.

### 1.2 Архитектура (оба репо)

| Область | Scorix | New |
|---------|--------|-----|
| Голосовой стек VAD/ASR/LLM/TTS | `docs/spec/voice-stack-tz.md`, `docs/spec/voice-stack-backlog.md` | реализация Voice Router, gates |
| Омниканал (чат + звонок) | `src/omni-pages.js`, `src/omni-bind.js` | OC-TZ, API messenger/webhook/knowledge |
| SIP / телефония | `src/app.js` (telephony, SIP-LIVE) | адаптеры, health |
| Server-authoritative UI | `scripts/verify-fe-server-authoritative.sh` | campaign/dial/runtime/analytics API |

### 1.3 Реализованный FE (репозиторий Scorix)

**Маршруты кабинета** (`parseCabinet` в `src/app.js`):

| Маршрут | Назначение |
|---------|------------|
| `#/cabinet/campaigns` | Список кампаний |
| `#/cabinet/campaigns/new` | Создание кампании |
| `#/cabinet/campaigns/:id` | Workspace кампании |
| `#/cabinet/connections` | Подключения (SIP + мессенджеры) |
| `#/cabinet/knowledge` | База знаний |
| `#/cabinet/usage` | Использование |
| `#/cabinet/webhook` | Webhook |
| `#/cabinet/crm` | CRM |
| `#/cabinet/dialogs` | Диалоги |
| `#/cabinet/analytics` | Отчёты |
| `#/cabinet/tariffs` | Тарифы / биллинг |
| `#/cabinet/account` | Настройки аккаунта |
| `#/cabinet/integrations` | Legacy → connections |

**Админка:** `#/admin`, `#/admin/integrations`, `#/admin/settings`.

**Ключевые файлы:** `src/app.js`, `src/api.js`, `src/omni-pages.js`, `src/omni-bind.js`, `src/styles.css`.

### 1.4 Дизайн

| Документ | Роль |
|----------|------|
| `.interface-design/system.md` | Токены, плотность, компоненты |
| `.cursor/rules/design.mdc` | Правила для агента |
| `docs/design-level-up-prompt.md` | Зоны A–F workspace (эталон качества) |

**Канон UI:** Syne + Manrope, кобальт `#2557ff`, светлая тема first. Статусы контактов: **В процессе / Завершён / Недозвон / Отмена**.

---

## Фаза 2. Матрица сверки

Для **каждого** требования из PRD (или US/FE-ID из handoff) заполни строку:

| Поле | Вопрос |
|------|--------|
| **ID** | US-xxx / FE-xxx / VOICE-xxx / OC-xxx |
| **PRD** | Что обещано пользователю (1–2 предложения) |
| **Архитектура** | Какой компонент/API отвечает; есть ли в New |
| **FE** | Маршрут, `data-testid`, функция — или «нет» |
| **API** | Эндпоинт + поле ответа — или stub/localStorage |
| **Дизайн** | Соответствует system.md / зоны A–F — или отклонение |
| **Статус** | `OK` / `PARTIAL` / `STUB` / `MISSING` / `DESIGN-DRIFT` / `OUT-OF-SCOPE` |
| **Доказательство** | Путь к файлу, скрин, `curl`, тест |
| **Действие** | PR в Scorix / задача в New / handoff / сознательный defer |

### Правила классификации

- **OK** — PRD выполнен, API живой, UI по дизайну.
- **PARTIAL** — UI есть, но не все состояния/ошибки/edge cases.
- **STUB** — только localStorage или заглушка без server-truth.
- **MISSING** — в PRD есть, в коде нет.
- **DESIGN-DRIFT** — логика есть, визуал ломает system.md или зоны A–F.
- **OUT-OF-SCOPE** — явно вынесено из v1 в PRD/TZ; зафиксировать ссылку на §.

### Обязательные сквозные проверки

1. **Server-truth:** при подключённом API нет тихих локальных fallback (см. `tests/verify-gap-closure.mjs`).
2. **Честность кабинета:** нет кнопок «запустить», если gates не пройдены; SIP/voice режимы отражают реальность (`FE-244`, `SIP-LIVE`).
3. **Омниканал:** страницы из `omni-pages.js` биндятся к API (`omni-bind.js`), не только статический HTML.
4. **Тексты:** не выдумывать copy — только из handoff/PRD.
5. **Секреты:** токены/ключи не светятся повторно; `.env` не в репо.

---

## Фаза 3. Автоматические проверки (Scorix)

Выполни и приложи вывод:

```bash
cd /path/to/Scorix
git checkout main && git pull origin main
node tests/verify-gap-closure.mjs
node scripts/check-omni-pages.mjs
node scripts/check-base-path.mjs
node --check src/app.js
npm install
npx playwright install chromium
npm run test:e2e:smoke
```

Ручной проход: `docs/smoke-checklist.md`.

На стенде (если доступен API): пройти workspace кампании end-to-end — цель → сценарий → контакты → телефония → готовность → запуск (или явный блокер).

---

## Фаза 4. Закрытие дыр

Приоритет:

1. **P0 — ложная готовность:** UI обещает то, чего бэк не делает (запуск, SIP live, аналитика из локальных цифр).
2. **P1 — MISSING по PRD с handoff:** есть `docs/handoff/fe/<ID>.md` — реализовать в Scorix.
3. **P2 — PARTIAL:** довести состояния ошибок, пустые экраны, loading.
4. **P3 — DESIGN-DRIFT:** правки по `design-level-up-prompt.md` зоны A–F.
5. **P4 — нет handoff:** завести handoff в New, **не** рисовать UI из головы.

### Как закрывать

| Тип дыры | Где править |
|----------|-------------|
| FE UI / маршрут | Scorix: `src/app.js`, `omni-pages.js`, `styles.css` |
| Контракт API | New: бэк + обновить handoff |
| Только дизайн | Scorix CSS + сверка с system.md |
| Документация / scope | New PRD или defer с обоснованием |

После каждой волны: коммит → push → PR → повторить фазу 3.

---

## Формат итогового отчёта

```markdown
## Сводка PR/MR (фаза 0)
| PR | Действие | Комментарий |
|----|----------|-------------|

## Матрица PRD × реализация
| ID | PRD | Архитектура | FE | API | Дизайн | Статус | Действие |
|----|-----|-------------|----|----|--------|--------|----------|

## Автопроверки
- verify-gap-closure: …
- omni-pages: …
- smoke e2e: …

## Дыры к закрытию (приоритет)
### P0
- …
### P1
- …

## Сознательно отложено (OUT-OF-SCOPE)
- …

## Риски / вопросы продакту
- …
```

---

## Критерии «верификация завершена»

- [ ] Все mergeable PR с продуктовым кодом влиты в `main` или явно закрыты.
- [ ] Матрица покрывает **100%** P0/P1 пунктов PRD (или каждый MISSING имеет handoff/задачу).
- [ ] `verify-gap-closure` и smoke e2e зелёные.
- [ ] Нет P0/P1 в статусе MISSING или STUB без пометки.
- [ ] DESIGN-DRIFT по зонам A–F либо исправлен, либо в бэклоге с скрином.
- [ ] Отчёт приложен; для закрытых дыр — ссылки на PR.

---END---

## Быстрый старт (одной строкой)

> Слей открытые PR в main, сверь PRD из New с `docs/spec/*`, кодом Scorix и `.interface-design/system.md`, прогони `verify-gap-closure` + smoke, закрой все P0/P1 дыры, отчёт в формате матрицы.

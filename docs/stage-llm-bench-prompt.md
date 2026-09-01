# Промпт: бенчмарк stage-based LLM Scorix

Скопируй всё содержимое блока ниже (от `---START---` до `---END---`) в новый чат Cursor.
Workspace: репозиторий **New** (промпты и StageEngine).

---START---

# Задача: бенчмарк stage-based LLM Scorix

Ты — QA-инженер промптов голосового агента Scorix. Нужен **текстовый симулятор** полного пайплайна (без ASR/TTS/SIP): от «клиент заполнил кампанию» до вердикта после разговора.

## Источник правды

Репозиторий: `New/`.

Промпты (читай файлы, рендери плейсхолдеры как в `backend/prompts/loader.py`):

| Шаг | prompt_id | Файл |
|-----|-----------|------|
| A1 | ui_fill.runtime_brief | `docs/prompts/campaign-preview/ui_fill.runtime_brief.md` |
| A2 | ui_fill.preview_blocks | `docs/prompts/campaign-preview/ui_fill.preview_blocks.md` |
| A3 | ui_fill.stages_from_brief | `docs/prompts/campaign-preview/ui_fill.stages_from_brief.md` |
| A4 | ui_fill.goal_verdicts | `docs/prompts/campaign-preview/ui_fill.goal_verdicts.md` |
| ход | stage.turn | `docs/prompts/voice-agent/stage.turn.md` |
| филлер | stage.filler | `docs/prompts/voice-agent/stage.filler.md` (опционально) |
| вердикт | verdict.classify | `docs/prompts/voice-agent/verdict.classify.md` |

Движок: `backend/voice/stage_engine.py`, `backend/voice/stage_turn.py`, `backend/voice/verdict_classify.py`.

Контракт `stage.turn` — строго JSON:
`{"utterance":"...","next":"stay|stage:<id>|end","notes_for_state":"..."}`

## Модели для сравнения

Прогони **одинаковый набор кейсов** на лёгких моделях Cursor:

1. `composer-2.5-fast`
2. `gemini-3.7-flash-high`
3. `cursor-grok-4.5-high-fast`
4. `cursor-grok-4.6-high-fast`

Для каждого LLM-вызова фиксируй:

- `model`
- `prompt_id`
- `latency_ms`
- `parse_ok` (JSON валиден и прошёл контракт)
- `retry_count` (если переспрашивали)

## Набор кейсов (~20)

Сгенерируй **20 разных кампаний** — как если клиент заполнил форму.

| # | Тип | goal | details / persona |
|---|-----|------|-------------------|
| 1 | Запись | запись на консультацию | клиника, слоты, без цен |
| 2 | Напоминание | напомнить о визите завтра | дата, адрес, перенос |
| 3 | NPS | узнать удовлетворённость | без давления |
| 4 | Доставка | подтвердить доставку | товар, окно, без суммы |
| 5 | Оплата | напомнить об оплате | мягко, без угроз |
| 6 | Рекрутинг | пригласить на собеседование | вакансия, время |
| 7 | B2B лид | уточнить интерес к демо | SaaS, без выдуманных фич |
| 8 | Продление | напомнить о продлении | условия из details |
| 9 | Вебинар | пригласить на вебинар | дата, регистрация |
| 10 | Опрос | короткий опрос по услуге | нейтрально |
| 11 | Агрессия | любая цель | persona: раздражён |
| 12 | Не сейчас | любая цель | persona: откладывает |
| 13 | Минимум слов | любая цель | persona: «алло», тишина |
| 14 | Много вопросов | B2B демо | persona: 5+ уточнений |
| 15 | Отказ сразу | любая цель | persona: «не интересно» |
| 16 | Согласие сразу | запись | persona: «да, записывайте» |
| 17 | Без имени | запись | attributes без name |
| 18 | С именем | запись | attributes: name=Иван |
| 19 | Длинный бриф | много ограничений | details ~300 слов |
| 20 | Короткий бриф | одна фраза goal | details пустые |

После A1–A4 сохрани: runtime_brief, preview, stages[], goal_verdicts[].

## Симулятор абонента (subscriber_sim)

Отдельная роль LLM — не stage.turn.

```
Ты играешь абонента в телефонном разговоре на русском.
Persona: {{persona}}
Контекст (ты этого не знаешь явно): {{persona_notes}}
Цель робота (ты не слышишь бриф): {{goal}}

Правила:
- 1–2 короткие фразы, как в живом звонке.
- Не выдумывай факты о продукте — реагируй на слова робота.
- Если persona «отказ» — вежливо или резко отказывай.
- Если «согласие» — иди к договорённости за 3–5 реплик.
- Иногда «алло», «подождите», «повторите».

История:
{{recent_turns}}

Последняя реплика робота: {{last_robot_utterance}}

Ответь только репликой абонента, без пояснений.
```

На **первом ходе** `subscriber_utterance=""` (исходящий звонок, робот говорит первым).

## Цикл одного диалога

Для кейса `C-XX` и модели `M-YY`:

1. **Setup** — A1→A2→A3→A4, логируй каждый вызов.
2. **Dialog loop** (цель ~25–35 сообщений суммарно, max 12 ходов робота):
   - Рендер `stage.turn` с полями из stage_engine: goal, runtime_brief, stage_id, stage_goal, on_success_next, on_decline_next, preview_greeting, preview_tone, preview_replies, attributes_json, state, recent_turns, subscriber_utterance, is_first_robot_turn.
   - Парс JSON → utterance, next, notes_for_state.
   - `next=stay` → тот же stage; `next=stage:<id>` → переход (invalid id → stay); `next=end` → выход.
   - После реплики робота → subscriber_sim → subscriber_utterance.
3. **Classify** — verdict.classify на полном transcript.
4. **Итог**: transcript, ended_reason, verdict_id, reason.

Стоп: `next=end`, или 12 ходов, или 3 подряд invalid JSON.

## Формат лога (обязательно)

### A. Шапка кейса

```markdown
## C-03 | Модель: gemini-3.7-flash-high | Сбор обратной связи

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | ... |
| details | ... |
| company_name | ... |
| persona | ... |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | Краткий результат |
|-----|-----------|------------|----------|-------------------|
| A1 | ui_fill.runtime_brief | 420 | ✓ | runtime_brief: «...» |
| A2 | ui_fill.preview_blocks | 380 | ✓ | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 510 | ✓ | N этапов |
| A4 | ui_fill.goal_verdicts | 290 | ✓ | M вердиктов |
```

### B. Таблица ходов

```markdown
| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | intro | stage.turn | 680 | (пусто) | «Здравствуйте...» | stay | ... | ✓ |
```

Оценка:

- ✓ ок
- ⚠ длинно (>2 предложения)
- ⚠ выдуман факт
- ⚠ имя без attributes
- ✗ invalid JSON / неверный next
- ✗ давление «оформить любой ценой»
- ✗ робот назвал verdict/статус обзвона

### C. Финал кейса

```markdown
| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 340 | satisfied | «...» | satisfied | ✓ |

**ended_reason:** end_signal | **turns:** 8
```

## Сводные бенчи (после всех 20×4 прогонов)

### Матрица моделей

| Модель | A1–A4 parse_ok % | stage.turn parse_ok % | avg turn ms | p95 turn ms | avg turns | verdict match % | critical errors |
|--------|------------------|----------------------|-------------|-------------|-----------|-----------------|-----------------|

critical errors = выдуманные факты + invalid JSON + verdict ∉ goal_verdicts.

### Ошибки по prompt_id

| prompt_id | error_type | count | пример | фикс-идея |
|-----------|------------|-------|--------|-----------|

### Рекомендации по прокачке промптов

Для каждого файла (stage.turn, verdict.classify, A1–A4):

- что ломается чаще всего;
- **конкретная правка** (1–3 строки, не переписывать целиком);
- нужен ли retry на JSON;
- какая модель лучше default для cheap-64k.

### Вердикт

- Лучшая модель для prod (latency / качество / JSON).
- Где промпт слабее модели (одна ошибка на всех моделях → правим промпт).
- Top-3 изменения P0/P1/P2.

## Правила

1. Не подменяй промпты — только файлы из `docs/prompts/`.
2. Симуляция текстом, без выдуманного API.
3. Битый JSON → 1 retry «верни только JSON»; логируй retry.
4. Transcript без телефонов/ФИО в notes.
5. Кейсы батчами по 5; после батча — мини-сводка parse_ok и latency.
6. Итог сохрани в `docs/evals/stage-bench-YYYY-MM-DD.md`.

## Порядок

1. Прочитай все 7 промпт-файлов.
2. Сгенерируй 20 кейсов.
3. Прогон модели #1 → промежуточная сводка.
4. Модели #2–#4.
5. Финальный отчёт.

Начни с C-01 на composer-2.5-fast: покажи полный формат A+B+C для одного кейса, затем продолжай без остановки.

---END---
